import { releaseTxns } from "@/lib/pay/release";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { docScope, scoped } from "@/lib/sales/access";
import { PaymentInput, firstError } from "@/lib/sales/schemas";
import { completeIfReady, recalcPaid } from "@/lib/sales/service";
import { PAY_METHOD, money, type PayMethod } from "@/lib/sales/shared";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  if (!s.perm.payRecord) return fail("Bạn chưa có quyền ghi nhận thu tiền", 403);
  const order = await db.order.findFirst({ where: scoped(s.where, { id }) });
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  if (order.status === "cancelled") return fail("Đơn đã huỷ, không thu tiền được", 409);
  const p = PaymentInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const amount = Math.round(p.data.amount);
  // Thu dư một chút (làm tròn) thì cho qua; thu dư nhiều là gõ nhầm.
  if (order.paid + amount > order.total + 1000) return fail(`Số tiền vượt phần còn nợ (${money(order.total - order.paid)})`);
  const pay = await db.payment.create({
    data: { workspaceId: a.ctx.workspace.id, orderId: id, amount, method: p.data.method, paidAt: p.data.paidAt ?? new Date(), note: p.data.note, createdBy: a.ctx.user.name },
  });
  await recalcPaid(id);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "payment.create", "order", id, `Thu ${money(amount)} (${PAY_METHOD[pay.method as PayMethod]}) cho đơn ${order.number}`);
  await completeIfReady(id);
  return ok(await db.order.findUnique({ where: { id }, include: { payments: { orderBy: { paidAt: "desc" } } } }), 201);
}

/** Xoá phiếu thu nhập nhầm: DELETE ?payment=<id>. */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  if (!s.perm.payDelete) return fail("Bạn chưa có quyền xoá phiếu thu", 403);
  const order = await db.order.findFirst({ where: scoped(s.where, { id }) });
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const pid = new URL(req.url).searchParams.get("payment") ?? "";
  const pay = await db.payment.findFirst({ where: { id: pid, orderId: id } });
  if (!pay) return fail("Không tìm thấy phiếu thu", 404);
  await db.payment.delete({ where: { id: pid } });
  await recalcPaid(id);
  await releaseTxns(a.ctx.workspace.id, { paymentIds: [pid] });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "payment.delete", "order", id, `Xoá phiếu thu ${money(pay.amount)} của đơn ${order.number}`, { before: pay });
  return ok(await db.order.findUnique({ where: { id }, include: { payments: { orderBy: { paidAt: "desc" } } } }));
}
