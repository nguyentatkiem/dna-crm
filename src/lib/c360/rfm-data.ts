// RFM phía server: lấy đơn đã xong/đã thanh toán, chấm điểm, ghi data._rfm, job hằng ngày.
import type { Record as DbRecord } from "@prisma/client";
import { db } from "../db";
import { getPref, setPref } from "../prefs";
import { fireEvent } from "../automation";
import type { WorkspaceConfig } from "../config/schema";
import { activeWorkspaces, dataOf, quietUpdate } from "./common";
import { computeRfm, type RfmResult } from "./rfm";

type RfmPref = { months: number; lastRun: number };
export const rfmPref = (wid: string) => getPref<RfmPref>(wid, "rfm", { months: 12, lastRun: 0 });

/** Đơn tính vào RFM: đã hoàn tất, hoặc đã thanh toán đủ (trừ đơn huỷ). */
export const countedOrder = (o: { status: string; paid: number; total: number }) => o.status === "done" || (o.status !== "cancelled" && o.total > 0 && o.paid >= o.total);

/** Chấm RFM cho cả workspace (tính trực tiếp, không đọc _rfm đã lưu). */
export async function rfmRows(workspaceId: string, months?: number): Promise<{ rows: RfmResult[]; contacts: Map<string, DbRecord>; months: number }> {
  const m = months ?? (await rfmPref(workspaceId)).months;
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" } });
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const orders = await db.order.findMany({ where: { workspaceId, status: { not: "cancelled" } }, select: { contactId: true, recordId: true, status: true, paid: true, total: true, createdAt: true } });
  const per = new Map<string, { at: Date; total: number }[]>();
  for (const o of orders) {
    if (!countedOrder(o)) continue;
    const id = o.contactId && byId.has(o.contactId) ? o.contactId : o.recordId && byId.has(o.recordId) ? o.recordId : null;
    if (!id) continue;
    per.set(id, [...(per.get(id) ?? []), { at: o.createdAt, total: o.total }]);
  }
  const rows = computeRfm(
    [...per].map(([id, os]) => ({ id, orders: os })),
    Date.now(),
    m,
  );
  return { rows, contacts: byId, months: m };
}

/** Ghi data._rfm (khoá nhóm) và _rfm_code ("R-F-M") lên khách; khách hết đơn thì xoá. Phát rfm_changed khi đổi nhóm. */
export async function recomputeRfm(workspaceId: string, cfg: WorkspaceConfig, opts: { fire?: boolean } = {}) {
  const { rows, contacts } = await rfmRows(workspaceId);
  const by = new Map(rows.map((r) => [r.id, r]));
  let changed = 0;
  for (const c of contacts.values()) {
    const d = dataOf(c);
    const r = by.get(c.id);
    const key = r?.segment ?? "";
    const code = r ? `${r.r}-${r.f}-${r.m}` : "";
    const prev = typeof d._rfm === "string" ? d._rfm : "";
    if (prev === key && (d._rfm_code ?? "") === code) continue;
    if (key) {
      d._rfm = key;
      d._rfm_code = code;
    } else {
      delete d._rfm;
      delete d._rfm_code;
    }
    const after = await quietUpdate(c, { dataJson: JSON.stringify(d) });
    if (prev !== key) {
      changed++;
      if (opts.fire !== false && key) await fireEvent(workspaceId, cfg, { kind: "rfm_changed", record: after, value: key });
    }
  }
  const p = await rfmPref(workspaceId);
  await setPref(workspaceId, "rfm", { ...p, lastRun: Date.now() });
  return { customers: rows.length, changed };
}

/** Job hằng ngày (đăng ký chạy mỗi giờ cũng được: tự bỏ qua nếu đã chạy trong 20 giờ qua). */
export async function tickRfm(now = Date.now()): Promise<void> {
  for (const { workspaceId, cfg } of await activeWorkspaces()) {
    const p = await rfmPref(workspaceId);
    if (now - p.lastRun < 20 * 3600e3) continue;
    // Lần đầu chỉ lấy mốc, không bắn hàng loạt sự kiện cho mọi khách.
    await recomputeRfm(workspaceId, cfg, { fire: !!p.lastRun });
  }
}
