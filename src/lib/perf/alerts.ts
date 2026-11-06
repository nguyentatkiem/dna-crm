// Cảnh báo tiến độ doanh thu giữa tháng: báo người đang chậm nhịp và trưởng nhóm của họ.
import { db, parseJson } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { behindBy, currentPeriod, dayOfPeriod, kpiBoard } from "../kpi";
import { notifyOnce, userIdByName } from "../notify";
import { vnd } from "../format";
import { leadersOf } from "./teams";

/** Ngưỡng: chậm hơn nhịp kỳ vọng quá 20%, chỉ từ ngày 10 của tháng. */
export const ALERT_FROM_DAY = 10;
export const ALERT_BEHIND = 0.2;

/** Có cần cảnh báo không (thuần): đã tới ngày 10, có chỉ tiêu và chậm hơn ngưỡng. */
export function shouldAlert(actual: number, target: number, day: number, days: number) {
  return day >= ALERT_FROM_DAY && target > 0 && behindBy(actual, target, day, days) > ALERT_BEHIND;
}

/**
 * Job hằng ngày (đăng ký mỗi 60 phút cũng được — notifyOnce chống gửi trùng trong 24 giờ):
 * từ ngày 10 của tháng, ai có chỉ tiêu doanh thu mà chậm nhịp quá 20% thì báo cho họ và trưởng nhóm, kèm link /w/kpi.
 */
export async function tickPerfAlerts(now = new Date()): Promise<void> {
  const period = currentPeriod(now);
  const day = dayOfPeriod(period, now);
  if (day < ALERT_FROM_DAY) return;
  const wsIds = (await db.kpiTarget.groupBy({ by: ["workspaceId"], where: { period, metric: "revenue" } })).map((r) => r.workspaceId);
  for (const wid of wsIds) {
    try {
      const cfgRow = await db.workspaceConfig.findFirst({ where: { workspaceId: wid, isActive: true } });
      const cfg = cfgRow ? parseJson<WorkspaceConfig | null>(cfgRow.configJson, null) : null;
      if (!cfg) continue;
      const board = await kpiBoard(wid, cfg, period, now);
      const href = `/w/kpi?period=${period}`;
      for (const row of board.rows) {
        if (!row.who) continue;
        const c = row.cells.revenue;
        if (!shouldAlert(c.actual, c.target, day, board.days)) continue;
        const gap = Math.max(0, Math.round(c.expected - c.actual));
        const pace = Math.round((c.expected / c.target) * 100);
        const userId = await userIdByName(wid, row.who);
        if (userId) await notifyOnce(wid, { userId, kind: "kpi", text: `Doanh thu tháng ${period} của bạn mới đạt ${c.pct}% chỉ tiêu (nhịp cần ${pace}%), còn thiếu ${vnd(gap)} so với nhịp.`, href });
        for (const leader of await leadersOf(wid, row.who)) {
          const lid = await userIdByName(wid, leader);
          if (lid && lid !== userId) await notifyOnce(wid, { userId: lid, kind: "kpi", text: `${row.who} đang chậm nhịp doanh thu tháng ${period}: đạt ${c.pct}% (nhịp cần ${pace}%), thiếu ${vnd(gap)}.`, href });
        }
      }
    } catch (e) {
      console.error("[perf-alerts]", wid, e instanceof Error ? e.message : e);
    }
  }
}
