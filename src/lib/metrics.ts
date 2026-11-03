import type { Record as DbRecord } from "@prisma/client";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { vnd } from "./format";

/** Status thắng = status màu green cuối cùng; thua = red/berry. */
export function wonLost(cfg: WorkspaceConfig) {
  const deals = getObject(cfg, "deals");
  const won = new Set(deals?.statuses.filter((s) => s.color === "green").map((s) => s.key));
  const lost = new Set(deals?.statuses.filter((s) => s.color === "red" || s.color === "berry").map((s) => s.key));
  return { won, lost };
}

export function computeKpis(cfg: WorkspaceConfig, records: DbRecord[]) {
  const { won, lost } = wonLost(cfg);
  const deals = records.filter((r) => r.objectKey === "deals");
  const contacts = records.filter((r) => r.objectKey === "contacts");
  const weekAgo = Date.now() - 7 * 864e5;
  const values: Record<string, { value: string; hint: string }> = {
    won_amount: { value: vnd(deals.filter((d) => won.has(d.status)).reduce((s, d) => s + d.amount, 0)), hint: `${deals.filter((d) => won.has(d.status)).length} mục đã thắng` },
    open_amount: { value: vnd(deals.filter((d) => !won.has(d.status) && !lost.has(d.status)).reduce((s, d) => s + d.amount, 0)), hint: `${deals.filter((d) => !won.has(d.status) && !lost.has(d.status)).length} mục đang mở` },
    new_contacts: { value: String(contacts.filter((c) => c.createdAt.getTime() > weekAgo).length), hint: "trong 7 ngày qua" },
    appointments: { value: String(records.filter((r) => r.objectKey === "appointments").length), hint: "tổng số lịch" },
    win_rate: (() => {
      const closed = deals.filter((d) => won.has(d.status) || lost.has(d.status));
      const rate = closed.length ? Math.round((closed.filter((d) => won.has(d.status)).length / closed.length) * 100) : 0;
      return { value: `${rate}%`, hint: `trên ${closed.length} mục đã đóng` };
    })(),
    hot_contacts: { value: String(contacts.filter((c) => c.score >= 70).length), hint: "điểm từ 70 trở lên" },
  };
  return cfg.kpis.map((k) => ({ label: k.label, ...values[k.metric] }));
}
