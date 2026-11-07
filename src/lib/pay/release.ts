// Trả giao dịch ngân hàng đã ghép về "Chờ ghép" khi phiếu thu / đơn bị xoá. Chỉ dùng ở server.
import type { Prisma } from "@prisma/client";
import { db, parseJson } from "@/lib/db";

function withNote(rawJson: string, note: string) {
  const r = parseJson<Record<string, unknown>>(rawJson, {});
  return JSON.stringify({ ...r, _crm: { ...((r._crm as object) ?? {}), note } });
}

/**
 * Phiếu thu (hoặc cả đơn) bị xoá → giao dịch ngân hàng đã ghép quay về "Chờ ghép" để ghép lại / bỏ qua,
 * thay vì kẹt ở trạng thái "Đã ghép" trỏ tới phiếu thu không còn.
 */
export async function releaseTxns(workspaceId: string, where: { paymentIds?: string[]; orderId?: string }) {
  const ors: Prisma.BankTxnWhereInput[] = [];
  if (where.paymentIds?.length) ors.push({ paymentId: { in: where.paymentIds } });
  if (where.orderId) ors.push({ orderId: where.orderId });
  if (!ors.length) return 0;
  const rows = await db.bankTxn.findMany({ where: { workspaceId, status: "matched", OR: ors } });
  for (const t of rows) {
    await db.bankTxn.update({ where: { id: t.id }, data: { status: "unmatched", paymentId: null, orderId: null, rawJson: withNote(t.rawJson, "Phiếu thu đã bị xoá – ghép lại hoặc bỏ qua") } });
  }
  return rows.length;
}
