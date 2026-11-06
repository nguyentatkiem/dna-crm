// Phần dùng chung phía server của Chăm sóc: quyền, cấu hình, thông tin liên lạc của khách.
import type { Prisma, Record as DbRecord, Ticket } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { getPref } from "../prefs";
import { can, getRole, memberSeesOwnOnly } from "../permissions";
import { LOYALTY_DEFAULT, TICKET_DEFAULT, summarize, tierFor, type LoyaltyPref, type TicketPref } from "./shared";

export type CareCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

export const ticketPref = (wid: string) => getPref<TicketPref>(wid, "ticket", TICKET_DEFAULT).then((p) => ({ slaHours: { ...TICKET_DEFAULT.slaHours, ...(p.slaHours ?? {}) } }));
export const loyaltyPref = (wid: string) => getPref<LoyaltyPref>(wid, "loyalty", LOYALTY_DEFAULT);

/** Chủ/quản lý mới được sửa cài đặt SLA, tích điểm. */
export async function isManager(ctx: CareCtx) {
  return can(await getRole(ctx.user.id, ctx.workspace.id), "see_all");
}

/**
 * Phiếu nhân viên thấy được: khi chủ bật "chỉ thấy khách của mình",
 * nhân viên chỉ thấy phiếu giao cho mình, phiếu chưa giao hoặc phiếu mình tạo.
 */
export async function ticketScope(ctx: CareCtx): Promise<Prisma.TicketWhereInput> {
  const base: Prisma.TicketWhereInput = { workspaceId: ctx.workspace.id };
  if (!memberSeesOwnOnly(ctx.workspace) || (await isManager(ctx))) return base;
  return { ...base, OR: [{ assignee: ctx.user.name }, { assignee: "" }, { createdBy: ctx.user.name }] };
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
