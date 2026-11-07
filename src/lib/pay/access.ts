// Quyền và tra đơn cho các route Thanh toán / Hoá đơn / Vận chuyển.
import { db } from "@/lib/db";
import { allow, accessOf } from "@/lib/permissions";
import { docScope, scoped, type SalesCtx } from "@/lib/sales/access";

export type PayPerm = { reconcile: boolean; einvoice: boolean; ship: boolean; settings: boolean; payRecord: boolean };

export async function payPerm(ctx: SalesCtx): Promise<PayPerm> {
  const acc = await accessOf(ctx);
  const reconcile = allow(acc, "bank_reconcile");
  return { reconcile, einvoice: allow(acc, "einvoice_issue"), ship: allow(acc, "shipping_manage"), settings: allow(acc, "settings_manage") || reconcile, payRecord: allow(acc, "payment_record") };
}

/** Đơn trong phạm vi xem của người dùng. */
export async function visibleOrder(ctx: SalesCtx, id: string) {
  if (!id) return null;
  const s = await docScope(ctx);
  return db.order.findFirst({ where: scoped(s.where, { id }) });
}
