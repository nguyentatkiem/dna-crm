import { membersWith } from "../permissions";
// Bản tin hiệu suất hằng tuần: sáng thứ Hai (từ 8 giờ giờ VN), mỗi người nhận tóm tắt tuần qua,
// trưởng nhóm nhận tóm tắt đội, chủ/quản lý nhận tóm tắt cả công ty. Mỗi người tối đa một bản tin mỗi tuần.
import { db, parseJson } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { isMondayVN, weekKey } from "../kpi";
import { notify, userIdByName } from "../notify";
import { allMembers } from "./teams";
import { loadFacts, perfPeople } from "./facts";
import { perfScorePref } from "./board";
import { computeMetrics, fmtValue, METRIC_DEFS, vnDayStart, type MetricKey, type Values } from "./metrics";

const VN = 7 * 3600e3;
const D = 864e5;
const KIND = "perf_digest";
const LINE: { key: MetricKey; label: string }[] = [
  { key: "revenue", label: "doanh thu" },
  { key: "won_deals", label: "giao dịch thắng" },
  { key: "calls", label: "cuộc gọi" },
  { key: "speed_to_lead", label: "speed-to-lead" },
];

/** "doanh thu 12 tr (+20%), cuộc gọi 30 (−25%), …" — so với tuần trước khi tuần trước có số. Chỉ số không có dữ liệu bị bỏ. */
export function digestLine(cur: Values, prev: Values): string {
  const parts: string[] = [];
  for (const { key, label } of LINE) {
    const c = cur[key];
    if (c == null) continue;
    const p = prev[key];
    let cmp = "";
    if (p != null && p !== 0) {
      const pct = Math.round(((c - p) / Math.abs(p)) * 100);
      // Thay đổi quá lớn (≥ 200%) ghi "gấp N lần" cho dễ đọc; chỉ số thời gian ghi nhanh/chậm hơn.
      const big = Math.abs(pct) >= 200 && p > 0 && c > 0;
      const mag = big ? `gấp ${(Math.max(c, p) / Math.min(c, p)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lần` : `${Math.abs(pct)}%`;
      if (pct === 0) cmp = " (=)";
      else if (!METRIC_DEFS[key].higherBetter) cmp = ` (${pct > 0 ? "chậm hơn" : "nhanh hơn"} ${mag})`;
      else cmp = big ? ` (${pct > 0 ? "tăng" : "giảm"} ${mag})` : ` (${pct > 0 ? "+" : "−"}${Math.abs(pct)}%)`;
    } else if (p === 0 && c === 0) cmp = " (=)";
    parts.push(`${label} ${fmtValue(key, c)}${cmp}`);
  }
  return parts.join(", ");
}

/** Có hoạt động gì không (tránh gửi bản tin toàn số 0). */
const active = (v: Values) => (v.revenue ?? 0) + (v.calls ?? 0) + (v.won_deals ?? 0) + (v.replies ?? 0) + (v.notes ?? 0) + (v.new_contacts ?? 0) > 0;

async function sendOnce(workspaceId: string, userId: string, wk: string, text: string, href: string, dry?: { userId: string; text: string; href: string }[]) {
  if (dry) {
    dry.push({ userId, text, href });
    return true;
  }
  const dup = await db.notification.findFirst({ where: { workspaceId, userId, kind: KIND, text: { startsWith: `Tuần ${wk}` } }, select: { id: true } });
  if (dup) return false;
  await notify(workspaceId, { userId, kind: KIND, text, href });
  return true;
}

/**
 * Job (đăng ký mỗi 60 phút): chỉ chạy thứ Hai từ 8 giờ giờ VN. Tuần qua = thứ Hai tuần trước 00:00 → thứ Hai này 00:00,
 * so với tuần liền trước nữa. Trả về số thông báo đã gửi. opts.dry: chỉ gom nội dung vào mảng, không ghi thông báo (để kiểm tra).
 */
export async function tickPerfDigest(now = new Date(), opts: { dry?: { userId: string; text: string; href: string }[] } = {}): Promise<number> {
  if (!isMondayVN(now) || new Date(now.getTime() + VN).getUTCHours() < 8) return 0;
  const dry = opts.dry;
  const wk = weekKey(new Date(now.getTime() - 7 * D));
  const monday = vnDayStart(now.getTime());
  const cur = { from: monday - 7 * D, to: monday };
  const prev = { from: monday - 14 * D, to: monday - 7 * D };
  let sent = 0;
  const rows = await db.workspaceConfig.findMany({ where: { isActive: true, workspace: { onboarded: true } }, select: { workspaceId: true, configJson: true } });
  for (const row of rows) {
    const wid = row.workspaceId;
    try {
      const cfg = parseJson<WorkspaceConfig | null>(row.configJson, null);
      if (!cfg) continue;
      const { people, teams } = await perfPeople(wid, cfg);
      if (!people.length) continue;
      const pref = await perfScorePref(wid);
      const facts = await loadFacts(wid, cfg, people, { from: prev.from, to: cur.to }, { staleDays: pref.staleDays, now: now.getTime() });
      const m = (who: string | string[], s: typeof cur) => computeMetrics(facts, who, s);

      for (const who of people) {
        const uid = await userIdByName(wid, who);
        if (!uid) continue;
        const c = m(who, cur);
        if (!active(c) && !active(m(who, prev))) continue;
        const extra = c.stale_deals ? ` · ${c.stale_deals} giao dịch tồn đọng` : "";
        if (await sendOnce(wid, uid, `${wk} — tuần qua của bạn`, `Tuần ${wk} — tuần qua của bạn: ${digestLine(c, m(who, prev)) || "chưa có hoạt động"}${extra}.`, `/w/perf/people/${encodeURIComponent(who)}?range=7d`, dry)) sent++;
      }

      for (const t of teams) {
        const members = allMembers(t).filter((p) => people.includes(p));
        const lid = t.leader ? await userIdByName(wid, t.leader) : "";
        if (!lid || !members.length) continue;
        const c = m(members, cur);
        const top = members.map((p) => ({ p, v: m(p, cur).revenue ?? 0 })).sort((a, b) => b.v - a.v)[0];
        const best = top && top.v > 0 ? ` · dẫn đầu doanh thu: ${top.p}` : "";
        if (await sendOnce(wid, lid, `${wk} đội ${t.name}`, `Tuần ${wk} đội ${t.name} — ${digestLine(c, m(members, prev)) || "chưa có hoạt động"}${best}.`, `/w/perf/overview?range=7d&team=${t.id}`, dry)) sent++;
      }

      const managers = (await membersWith(wid, "perf_view_team")).map((userId) => ({ userId }));
      const c = m(people, cur);
      const text = `Tuần ${wk} cả công ty — ${digestLine(c, m(people, prev)) || "chưa có hoạt động"}${c.stale_deals ? ` · ${c.stale_deals} giao dịch tồn đọng` : ""}.`;
      for (const mg of managers) if (await sendOnce(wid, mg.userId, `${wk} cả công ty`, text, "/w/perf/overview?range=7d", dry)) sent++;
    } catch (e) {
      console.error("[perf-digest]", wid, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}
