// Hoa hồng theo tháng: doanh thu từng người (từ đơn hàng / phiếu thu) → hoa hồng theo bậc + thưởng trưởng nhóm.
import { db } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { memberNames, monthRange, ownersOf, revenueOwner, teamOf } from "../kpi";
import { allMembers, listTeams, ownerNames } from "./teams";
import { commissionRules } from "./server";
import { commissionFor, leaderBonus, type CommissionRules } from "./shared";

export type CommissionRow = { who: string; teams: string[]; revenue: number; orders: number; commission: number; leaderBonus: number; leaderOf: string[]; total: number };

/**
 * Doanh thu tính hoa hồng theo người trong tháng.
 * - base "paid": cộng các phiếu thu (Payment) có ngày thu trong tháng — tiền thật đã về.
 * - base "done": cộng tổng giá trị các đơn trạng thái "Hoàn tất" cập nhật lần cuối trong tháng.
 * Người được tính: người phụ trách giao dịch gắn với đơn → người phụ trách khách → người tạo đơn → người lập phiếu thu
 * (giống cách tính doanh thu KPI, vì chủ/kế toán thường tạo đơn hộ nhân viên bán).
 */
export async function revenueByPerson(workspaceId: string, period: string, base: CommissionRules["base"]) {
  const { from, to } = monthRange(period);
  const out: Record<string, { revenue: number; orders: Set<string> }> = {};
  const add = (who: string, v: number, orderId: string) => {
    const o = (out[who] ??= { revenue: 0, orders: new Set() });
    o.revenue += v;
    o.orders.add(orderId);
  };
  if (base === "paid") {
    const pays = await db.payment.findMany({ where: { workspaceId, paidAt: { gte: from, lt: to } }, select: { amount: true, createdBy: true, orderId: true, order: { select: { createdBy: true, recordId: true, contactId: true, status: true } } } });
    const owners = await ownersOf(workspaceId, pays.flatMap((p) => [p.order?.recordId, p.order?.contactId]));
    for (const p of pays) {
      if (p.order?.status === "cancelled") continue;
      const deal = p.order?.recordId ? owners.get(p.order.recordId) : undefined;
      const contact = p.order?.contactId ? owners.get(p.order.contactId) : undefined;
      add(revenueOwner({ dealOwner: deal?.objectKey === "deals" ? deal.ownerName : "", contactOwner: contact?.ownerName, orderCreatedBy: p.order?.createdBy, paymentCreatedBy: p.createdBy }), p.amount, p.orderId);
    }
  } else {
    const orders = await db.order.findMany({ where: { workspaceId, status: "done", updatedAt: { gte: from, lt: to } }, select: { id: true, total: true, createdBy: true, recordId: true, contactId: true } });
    const owners = await ownersOf(workspaceId, orders.flatMap((o) => [o.recordId, o.contactId]));
    for (const o of orders) {
      const deal = o.recordId ? owners.get(o.recordId) : undefined;
      const contact = o.contactId ? owners.get(o.contactId) : undefined;
      add(revenueOwner({ dealOwner: deal?.objectKey === "deals" ? deal.ownerName : "", contactOwner: contact?.ownerName, orderCreatedBy: o.createdBy }), o.total, o.id);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { revenue: v.revenue, orders: v.orders.size }]));
}

/**
 * Ghép bảng hoa hồng (thuần): hoa hồng cá nhân theo bậc, trưởng nhóm thêm % doanh thu của các thành viên khác.
 */
export function buildCommission(people: string[], revenue: Record<string, { revenue: number; orders: number }>, teams: { name: string; leader: string; members: string[] }[], rules: CommissionRules): CommissionRow[] {
  return people
    .map((who) => {
      const rev = revenue[who]?.revenue ?? 0;
      const led = teams.filter((t) => t.leader === who);
      const bonus = led.reduce((s, t) => s + leaderBonus(allMembers(t).filter((m) => m !== who).map((m) => revenue[m]?.revenue ?? 0), rules.teamLeaderPct), 0);
      const commission = commissionFor(rev, rules);
      return { who, teams: teams.filter((t) => allMembers(t).includes(who)).map((t) => t.name), revenue: rev, orders: revenue[who]?.orders ?? 0, commission, leaderBonus: bonus, leaderOf: led.map((t) => t.name), total: commission + bonus };
    })
    .sort((a, b) => b.total - a.total || b.revenue - a.revenue || a.who.localeCompare(b.who, "vi"));
}

export async function commissionBoard(workspaceId: string, cfg: WorkspaceConfig, period: string, onlyWho?: string) {
  const rules = await commissionRules(workspaceId);
  const [revenue, teams, names, owners] = await Promise.all([revenueByPerson(workspaceId, period, rules.base), listTeams(workspaceId), memberNames(workspaceId), ownerNames(workspaceId)]);
  // Chủ chỉ có dòng khi nằm trong đội hoặc có doanh thu đứng tên.
  const people = [...new Set([...teamOf(cfg, names).filter((n) => !owners.has(n)), ...teams.flatMap(allMembers), ...Object.keys(revenue).filter(Boolean)])];
  let rows = buildCommission(people, revenue, teams, rules);
  const unassigned = revenue[""]?.revenue ?? 0;
  if (onlyWho !== undefined) rows = rows.filter((r) => r.who === onlyWho);
  return { period, rules, rows, unassigned: onlyWho !== undefined ? 0 : unassigned };
}
