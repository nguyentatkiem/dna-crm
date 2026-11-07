// Đối soát chuyển khoản: lưu giao dịch ngân hàng (idempotent), tự ghép với đơn theo payCode, ghép tay / bỏ qua.
import type { BankTxn, Order } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db, parseJson } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify, userIdByName } from "@/lib/notify";
import { membersWith } from "@/lib/permissions";
import { completeIfReady, recalcPaid } from "@/lib/sales/service";
import { money, remaining } from "@/lib/sales/shared";
import type { IncomingTxn } from "./providers";
import { paySettings } from "./settings";
import { payCodeCandidates, payCodeFor } from "./vietqr";

type Actor = { id: string; name: string } | null;
export const AUTO_ACTOR = "Đối soát tự động";

/** Gán payCode cho đơn nếu chưa có (giữ nguyên khi đã có). */
export async function ensurePayCode(order: Pick<Order, "id" | "workspaceId" | "number" | "payCode">, prefix?: string) {
  if (order.payCode) return order.payCode;
  const code = payCodeFor(order, prefix ?? (await paySettings(order.workspaceId)).payCodePrefix);
  await db.order.updateMany({ where: { id: order.id, payCode: "" }, data: { payCode: code } });
  const fresh = await db.order.findUnique({ where: { id: order.id }, select: { payCode: true } });
  return fresh?.payCode || code;
}

/** Gán payCode cho mọi đơn chưa có của workspace. */
export async function ensurePayCodes(workspaceId: string) {
  const { payCodePrefix } = await paySettings(workspaceId);
  const rows = await db.order.findMany({ where: { workspaceId, payCode: "" }, select: { id: true, workspaceId: true, number: true, payCode: true } });
  for (const o of rows) await ensurePayCode(o, payCodePrefix);
  return rows.length;
}

/** Ghi chú nội bộ của CRM gắn vào rawJson (không đổi dữ liệu gốc nhà cung cấp). */
export function txnNote(t: Pick<BankTxn, "rawJson">) {
  return parseJson<{ _crm?: { note?: string } }>(t.rawJson, {})._crm?.note ?? "";
}
function withNote(rawJson: string, note: string) {
  const r = parseJson<Record<string, unknown>>(rawJson, {});
  return JSON.stringify({ ...r, _crm: { ...((r._crm as object) ?? {}), note } });
}

/** Lưu một giao dịch; gửi lại cùng mã giao dịch thì trả bản cũ (không ghi trùng). */
export async function ingestTxn(workspaceId: string, t: IncomingTxn) {
  const key = { workspaceId_provider_externalId: { workspaceId, provider: t.provider, externalId: t.externalId } };
  const existing = await db.bankTxn.findUnique({ where: key });
  if (existing) return { txn: existing, created: false };
  try {
    const txn = await db.bankTxn.create({
      data: { workspaceId, provider: t.provider, externalId: t.externalId, amount: Math.round(t.amount), content: t.content.slice(0, 1000), accountNo: t.accountNo.slice(0, 40), at: t.at, status: t.amount > 0 ? "unmatched" : "ignored", rawJson: JSON.stringify(t.raw ?? {}).slice(0, 20000) },
    });
    return { txn, created: true };
  } catch (e) {
    // Hai lần gửi đồng thời: lần sau gặp ràng buộc unique.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { txn: (await db.bankTxn.findUnique({ where: key }))!, created: false };
    throw e;
  }
}

/** Đơn khớp nội dung chuyển khoản (theo payCode), không tính đơn huỷ. */
export async function orderForContent(workspaceId: string, content: string, prefix: string) {
  const cands = payCodeCandidates(content, prefix);
  if (!cands.length) return null;
  const rows = await db.order.findMany({ where: { workspaceId, payCode: { in: cands } } });
  if (!rows.length) return null;
  return rows.sort((a, b) => b.payCode.length - a.payCode.length)[0];
}

export type MatchResult = { status: "matched" | "unmatched" | "ignored"; orderId?: string; paymentId?: string; note?: string };

/**
 * Ghi phiếu thu từ một giao dịch đã giữ chỗ. Thu dư (quá mức lệch cho phép) thì chỉ ghi phần còn nợ và ghi chú phần thừa.
 */
async function applyToOrder(txn: BankTxn, stale: Order, actor: Actor, tolerance: number, amountOverride?: number): Promise<MatchResult> {
  const order = (await db.order.findUnique({ where: { id: stale.id } })) ?? stale;
  const left = remaining(order);
  const want = Math.round(amountOverride ?? txn.amount);
  const amount = want > left + tolerance ? left : want;
  const extra = Math.round(txn.amount) - amount;
  const notes: string[] = [];
  if (amount < left) notes.push(`Thanh toán một phần: còn nợ ${money(left - amount)}`);
  if (extra > tolerance) notes.push(`Khách chuyển thừa ${money(extra)} – cần hoàn lại hoặc ghi nhận`);
  const pay = await db.payment.create({
    data: {
      workspaceId: txn.workspaceId,
      orderId: order.id,
      amount,
      method: "transfer",
      paidAt: txn.at,
      note: `Chuyển khoản ${txn.provider.toUpperCase()} · mã GD ${txn.externalId}${txn.content ? ` · ${txn.content.slice(0, 120)}` : ""}`.slice(0, 500),
      createdBy: actor?.name ?? AUTO_ACTOR,
    },
  });
  await recalcPaid(order.id);
  await db.bankTxn.update({ where: { id: txn.id }, data: { paymentId: pay.id, orderId: order.id, status: "matched", rawJson: withNote(txn.rawJson, notes.join(". ")) } });
  await audit({ workspaceId: txn.workspaceId, user: actor }, "payment.create", "order", order.id, `${actor ? `${actor.name} ghép tay` : "Tự đối soát"}: thu ${money(amount)} chuyển khoản (GD ${txn.externalId}) cho đơn ${order.number}`);
  await completeIfReady(order.id);
  await notifyPaid(order, amount, left - amount, notes.join(". "), actor);
  return { status: "matched", orderId: order.id, paymentId: pay.id, note: notes.join(". ") };
}

async function notifyPaid(order: Order, amount: number, stillDue: number, note: string, actor: Actor) {
  const text = `💰 Đơn ${order.number}${order.customerName ? ` (${order.customerName})` : ""} nhận chuyển khoản ${money(amount)}${stillDue > 0 ? ` · còn nợ ${money(stillDue)}` : " · đã thu đủ"}${note && note.includes("thừa") ? " · có tiền thừa" : ""}`;
  const ids = new Set<string>();
  const creator = await userIdByName(order.workspaceId, order.createdBy);
  if (creator) ids.add(creator);
  for (const id of await membersWith(order.workspaceId, "bank_reconcile")) ids.add(id);
  if (actor) ids.delete(actor.id);
  for (const userId of ids) await notify(order.workspaceId, { userId, kind: "payment", text, href: `/w/orders/${order.id}` });
}

/** Tự ghép một giao dịch chưa ghép. Giữ chỗ bằng orderId để hai tiến trình không ghi hai phiếu thu. */
export async function autoMatch(txnId: string): Promise<MatchResult> {
  const txn = await db.bankTxn.findUnique({ where: { id: txnId } });
  if (!txn || txn.status !== "unmatched" || txn.orderId) return { status: (txn?.status as MatchResult["status"]) ?? "unmatched", orderId: txn?.orderId ?? undefined };
  const s = await paySettings(txn.workspaceId);
  const order = await orderForContent(txn.workspaceId, txn.content, s.payCodePrefix);
  if (!order) return { status: "unmatched", note: "Không thấy mã đơn trong nội dung" };
  const why = order.status === "cancelled" ? `Đơn ${order.number} đã huỷ` : remaining(order) <= 0 ? `Đơn ${order.number} đã thu đủ trước đó` : "";
  if (why) {
    await db.bankTxn.update({ where: { id: txn.id }, data: { rawJson: withNote(txn.rawJson, `${why} – kiểm tra rồi ghép tay hoặc bỏ qua`) } });
    return { status: "unmatched", note: why };
  }
  const claim = await db.bankTxn.updateMany({ where: { id: txn.id, status: "unmatched", orderId: null }, data: { orderId: order.id } });
  if (!claim.count) return { status: "unmatched" };
  try {
    return await applyToOrder({ ...txn, orderId: order.id }, order, null, s.tolerance);
  } catch (e) {
    await db.bankTxn.update({ where: { id: txn.id }, data: { orderId: null } });
    throw e;
  }
}

/** Ghép tay một giao dịch với đơn (người có quyền Đối soát chuyển khoản). */
export async function manualMatch(workspaceId: string, txnId: string, orderId: string, actor: Actor, amount?: number): Promise<MatchResult | { error: string }> {
  const txn = await db.bankTxn.findFirst({ where: { id: txnId, workspaceId } });
  if (!txn) return { error: "Không tìm thấy giao dịch" };
  if (txn.status === "matched") return { error: "Giao dịch đã được ghép" };
  if (txn.amount <= 0) return { error: "Giao dịch tiền ra, không ghép được" };
  const order = await db.order.findFirst({ where: { id: orderId, workspaceId } });
  if (!order) return { error: "Không tìm thấy đơn hàng" };
  if (order.status === "cancelled") return { error: "Đơn đã huỷ" };
  if (remaining(order) <= 0) return { error: "Đơn đã thu đủ" };
  const s = await paySettings(workspaceId);
  const claim = await db.bankTxn.updateMany({ where: { id: txn.id, status: { in: ["unmatched", "ignored"] }, paymentId: null }, data: { orderId: order.id, status: "unmatched" } });
  if (!claim.count) return { error: "Giao dịch vừa được người khác xử lý" };
  const amt = amount ? Math.min(Math.round(amount), Math.round(txn.amount)) : undefined;
  return applyToOrder({ ...txn, orderId: order.id }, order, actor, s.tolerance, amt);
}

export async function setIgnored(workspaceId: string, txnId: string, ignored: boolean, actor: Actor) {
  const txn = await db.bankTxn.findFirst({ where: { id: txnId, workspaceId } });
  if (!txn) return { error: "Không tìm thấy giao dịch" };
  if (txn.status === "matched") return { error: "Giao dịch đã ghép, xoá phiếu thu ở đơn trước nếu cần" };
  await db.bankTxn.update({ where: { id: txn.id }, data: { status: ignored ? "ignored" : "unmatched", orderId: null } });
  await audit({ workspaceId, user: actor }, ignored ? "bank.ignore" : "bank.restore", "bankTxn", txn.id, `${ignored ? "Bỏ qua" : "Khôi phục"} giao dịch ${txn.provider.toUpperCase()} ${txn.externalId} (${money(txn.amount)})`);
  return { ok: true };
}

/** Nhận một lô giao dịch từ webhook: lưu + tự ghép. Trả tóm tắt để log. */
export async function receiveTxns(workspaceId: string, list: IncomingTxn[]) {
  const out: { externalId: string; created: boolean; status: string; orderId?: string }[] = [];
  for (const t of list) {
    if (!t.externalId) continue;
    const { txn, created } = await ingestTxn(workspaceId, t);
    let status = txn.status;
    let orderId = txn.orderId ?? undefined;
    if (created && txn.status === "unmatched") {
      const r = await autoMatch(txn.id).catch((e) => {
        console.error("[pay] autoMatch", e instanceof Error ? e.message : e);
        return { status: "unmatched" as const, orderId: undefined };
      });
      status = r.status;
      orderId = r.orderId;
    }
    out.push({ externalId: t.externalId, created, status, orderId });
  }
  return out;
}
