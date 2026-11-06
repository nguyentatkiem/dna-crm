import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { docScope, scoped, resolveLinks } from "@/lib/sales/access";
import { totals } from "@/lib/sales/lines";
import { OrderInput, OrderPatch, firstError } from "@/lib/sales/schemas";
import { completeIfReady } from "@/lib/sales/service";
import { markVoucherUsed, orderVoucher, releaseOrderVoucher } from "@/lib/voucher/service";
import { ORDER_NEXT, ORDER_STATUS, type OrderStatus } from "@/lib/sales/shared";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  const order = await db.order.findFirst({ where: scoped(s.where, { id }), include: { payments: { orderBy: { paidAt: "desc" } } } });
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  return ok(order);
}

/** Đổi trạng thái / hạn thanh toán / ghi chú; khi đơn còn "Mới" thì sửa được cả dòng hàng (gửi kèm items). */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  const before = await db.order.findFirst({ where: scoped(s.where, { id }) });
  if (!before) return fail("Không tìm thấy đơn hàng", 404);
  if (!s.perm.orderEdit) return fail("Bạn chưa có quyền cập nhật đơn hàng", 403);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = OrderPatch.safeParse(body);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const data: Record<string, unknown> = {};
  let voucher: { code: string; discount: number } | null = null;
  let withoutVoucher: Record<string, unknown> = {};

  if (d.status && d.status !== before.status) {
    if (!ORDER_NEXT[before.status as OrderStatus]?.includes(d.status as OrderStatus)) return fail(`Không chuyển được từ “${ORDER_STATUS[before.status as OrderStatus]?.label ?? before.status}” sang “${ORDER_STATUS[d.status as OrderStatus].label}”`, 409);
    if (d.status === "cancelled" && before.paid > 0 && !s.perm.cancelPaid) return fail("Đơn đã thu tiền: bạn chưa có quyền “Huỷ đơn đã thu tiền”", 403);
    data.status = d.status;
  }
  if (d.dueAt !== undefined) data.dueAt = d.dueAt;
  if (d.note !== undefined) data.note = d.note;

  if (Array.isArray(body.items)) {
    if (before.status !== "new") return fail("Chỉ sửa dòng hàng khi đơn còn ở trạng thái Mới", 409);
    const full = OrderInput.safeParse({ ...body, customerName: body.customerName ?? before.customerName });
    if (!full.success) return fail(firstError(full.error));
    const links = await resolveLinks(a.ctx, full.data);
    const vc = await orderVoucher(a.ctx.workspace.id, body.voucherCode ?? before.voucherCode, totals(full.data.items, full.data.discount).subtotal - full.data.discount, links.contactId, id);
    if ("error" in vc) return fail(vc.error ?? "Mã giảm giá không hợp lệ", 422);
    voucher = vc;
    withoutVoucher = { ...totals(full.data.items, full.data.discount), voucherCode: "" };
    Object.assign(data, {
      ...links,
      customerName: full.data.customerName,
      customerPhone: full.data.customerPhone,
      itemsJson: JSON.stringify(full.data.items),
      ...totals(full.data.items, full.data.discount + vc.discount),
      voucherCode: vc.code,
    });
  }

  const order = await db.order.update({ where: { id }, data });
  // Voucher: đổi/bỏ mã thì hoàn mã cũ; huỷ đơn thì hoàn mã.
  if (voucher) {
    await releaseOrderVoucher(order.workspaceId, id, voucher.code);
    if (voucher.code && !(await markVoucherUsed(order.workspaceId, voucher.code, order, voucher.discount, a.ctx.user.name))) {
      // Mã vừa bị đơn khác giữ: bỏ phần giảm của mã, giữ các thay đổi khác.
      await db.order.update({ where: { id }, data: withoutVoucher });
      return fail(`Mã ${voucher.code} vừa được dùng cho đơn khác, đơn đã lưu nhưng không áp mã`, 409);
    }
  }
  if (data.status === "cancelled") await releaseOrderVoucher(order.workspaceId, id);
  const diff = diffOf(before as unknown as Record<string, unknown>, data);
  if (Object.keys(diff).length) {
    const what = data.status ? `trạng thái → ${ORDER_STATUS[data.status as OrderStatus].label}` : Object.keys(diff).join(", ");
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "order.update", "order", id, `Sửa đơn ${order.number}: ${what}`, diff);
  }
  await completeIfReady(id);
  return ok(await db.order.findUnique({ where: { id }, include: { payments: { orderBy: { paidAt: "desc" } } } }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  if (!s.perm.del) return fail("Bạn chưa có quyền xoá. Hãy nhờ chủ workspace cấp quyền.", 403);
  const before = await db.order.findFirst({ where: scoped(s.where, { id }), include: { payments: true } });
  if (!before) return fail("Không tìm thấy đơn hàng", 404);
  await db.order.delete({ where: { id } });
  await releaseOrderVoucher(a.ctx.workspace.id, id);
  // Báo giá gốc mở lại được để tạo đơn mới.
  await db.quote.updateMany({ where: { workspaceId: a.ctx.workspace.id, orderId: id }, data: { orderId: null } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "order.delete", "order", id, `Xoá đơn ${before.number} (${before.customerName})`, { before });
  return ok({ deleted: true });
}
