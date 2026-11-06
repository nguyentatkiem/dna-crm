// Phần dùng chung phía server của Chăm sóc: quyền, cấu hình, thông tin liên lạc của khách.
import type { Prisma, Record as DbRecord, Ticket } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { getPref } from "../prefs";
import { accessOf, allow, visibleOwners, type Perm } from "../permissions";
import { LOYALTY_DEFAULT, TICKET_DEFAULT, summarize, tierFor, type LoyaltyPref, type TicketPref } from "./shared";

export type CareCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

export const ticketPref = (wid: string) => getPref<TicketPref>(wid, "ticket", TICKET_DEFAULT).then((p) => ({ slaHours: { ...TICKET_DEFAULT.slaHours, ...(p.slaHours ?? {}) } }));
export const loyaltyPref = (wid: string) => getPref<LoyaltyPref>(wid, "loyalty", LOYALTY_DEFAULT);

/** @deprecated Dùng careCan(ctx, perm). Giữ cho code cũ: = có quyền "Cài đặt SLA & tích điểm". */
export async function isManager(ctx: CareCtx) {
  return allow(await accessOf(ctx), "care_settings");
}

/** Có quyền p trong Chăm sóc không (ticket_assign, loyalty_adjust, care_settings...). */
export const careCan = async (ctx: CareCtx, p: Perm) => allow(await accessOf(ctx), p);

/**
 * Phiếu thấy được: ai có "Xem mọi phiếu hỗ trợ" hoặc phạm vi Toàn bộ thấy hết; còn lại thấy phiếu giao cho
 * mình / người cùng đội, phiếu mình (đội) tạo, và phiếu chưa giao nếu phạm vi gồm mục chưa giao.
 */
export async function ticketScope(ctx: CareCtx): Promise<Prisma.TicketWhereInput> {
  const base: Prisma.TicketWhereInput = { workspaceId: ctx.workspace.id };
  const acc = await accessOf(ctx);
  const names = visibleOwners(acc);
  if (!names || allow(acc, "ticket_view_all")) return base;
  const inNames = names.length === 1 ? names[0] : { in: names };
  return { ...base, OR: [{ assignee: inNames }, { createdBy: inNames }, ...(acc.unassigned ? [{ assignee: "" }] : [])] };
}

export async function findTicket(ctx: CareCtx, id: string): Promise<Ticket | null> {
  return db.ticket.findFirst({ where: { AND: [await ticketScope(ctx), { id }] } });
}

/** SĐT, email, Zalo uid của một khách theo cấu hình trường của bảng. */
export function contactCard(cfg: WorkspaceConfig, r: Pick<DbRecord, "id" | "title" | "objectKey" | "dataJson" | "ownerName">) {
  const obj = getObject(cfg, r.objectKey);
  const d = parseJson<Record<string, unknown>>(r.dataJson, {});
  const pick = (t: string) => {
    const k = obj?.fields.find((f) => f.type === t)?.key;
    return k ? String(d[k] ?? "") : "";
  };
  return { id: r.id, title: r.title, objectKey: r.objectKey, phone: pick("phone"), email: pick("email"), zaloUid: typeof d._zalo_uid === "string" ? d._zalo_uid : "", owner: r.ownerName };
}

/** Số dư, điểm đã tích và hạng của nhiều khách cùng lúc. */
export async function loyaltyOf(workspaceId: string, recordIds?: string[]) {
  const pref = await loyaltyPref(workspaceId);
  const txns = await db.loyaltyTxn.findMany({ where: { workspaceId, ...(recordIds ? { recordId: { in: recordIds } } : {}) }, select: { recordId: true, points: true, createdAt: true } });
  const by = new Map<string, { points: number; createdAt: Date }[]>();
  for (const t of txns) {
    const arr = by.get(t.recordId) ?? [];
    arr.push(t);
    by.set(t.recordId, arr);
  }
  const out = new Map<string, { balance: number; earned: number; lastAt: string | null; tier: ReturnType<typeof tierFor> }>();
  for (const [id, arr] of by) {
    const s = summarize(arr);
    out.set(id, { ...s, tier: tierFor(s.earned, pref.tiers) });
  }
  return { pref, map: out };
}
