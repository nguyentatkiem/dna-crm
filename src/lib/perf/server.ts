// Phía server của Quản lý hiệu suất: cấu hình (Pref) và quyền.
import { getPref } from "../prefs";
import { accessOf, allow, type Role } from "../permissions";
import { COMMISSION_DEFAULT, PERF_DEFAULT, ROUTING_DEFAULT, normTiers, type CommissionRules, type PerfPref, type TicketRouting } from "./shared";

export type PerfCtx = { user: { id: string; name: string }; workspace: { id: string } };

/** Pref "perf": bộ tiêu chí đánh giá. Chưa cấu hình thì dùng mặc định. */
export async function perfPref(wid: string): Promise<PerfPref> {
  const p = await getPref<PerfPref>(wid, "perf", PERF_DEFAULT);
  return { criteria: Array.isArray(p.criteria) && p.criteria.length ? p.criteria : PERF_DEFAULT.criteria };
}

/** Pref "commission": quy tắc hoa hồng. */
export async function commissionRules(wid: string): Promise<CommissionRules> {
  const p = await getPref<CommissionRules>(wid, "commission", COMMISSION_DEFAULT);
  return {
    base: p.base === "done" ? "done" : "paid",
    mode: p.mode === "bracket" ? "bracket" : "progressive",
    tiers: normTiers(Array.isArray(p.tiers) ? p.tiers : COMMISSION_DEFAULT.tiers),
    teamLeaderPct: Number.isFinite(p.teamLeaderPct) ? Math.max(0, Math.min(100, p.teamLeaderPct)) : COMMISSION_DEFAULT.teamLeaderPct,
  };
}

/** Pref "ticketRouting": phân loại phiếu và đội nhận. */
export async function routingPref(wid: string): Promise<TicketRouting> {
  const p = await getPref<TicketRouting>(wid, "ticketRouting", ROUTING_DEFAULT);
  return {
    categories: Array.isArray(p.categories) ? p.categories.filter((c) => typeof c === "string" && c.trim()) : ROUTING_DEFAULT.categories,
    rules: Array.isArray(p.rules) ? p.rules.filter((r) => r && typeof r.category === "string" && typeof r.teamId === "string") : [],
    defaultTeamId: typeof p.defaultTeamId === "string" ? p.defaultTeamId : "",
    autoAssign: p.autoAssign !== false,
  };
}

/** Quyền trong mô-đun: quản lý (chủ + quản lý) chấm điểm, xem mọi người; chủ sửa tiêu chí, quy tắc, mở khoá phiếu đã chốt. */
export async function perfRole(ctx: PerfCtx): Promise<{ role: Role; manager: boolean; owner: boolean }> {
  const acc = await accessOf(ctx);
  return { role: acc.base, manager: allow(acc, "perf_review") || allow(acc, "perf_view_team"), owner: allow(acc, "perf_manage_rules") };
}
