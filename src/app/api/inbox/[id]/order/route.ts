import { z } from "zod";
import { POST as createOrder } from "@/app/api/orders/route";
import { db } from "@/lib/db";
import { addNote, sendReply } from "@/lib/inbox";
import { findVisibleConversation } from "@/lib/inbox-list";
import { appApi, fail, ok } from "@/lib/http";
import { docScope, linkedTo, scoped } from "@/lib/sales/access";
import { activeProducts } from "@/lib/sales/page";

type P = { params: Promise<{ id: string }> };

/** Dữ liệu cho ô tạo đơn trong chat: sản phẩm đang bán, 5 đơn gần nhất của khách đã gắn, quyền tạo đơn. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const s = await docScope(a.ctx);
  const [products, orders] = await Promise.all([
    activeProducts(a.ctx.workspace.id),
    conv.recordId
      ? db.order.findMany({ where: scoped(s.where, linkedTo(conv.recordId)), orderBy: { createdAt: "desc" }, take: 5, select: { id: true, number: true, status: true, total: true, paid: true, createdAt: true } })
      : [],
  ]);
  return ok({ products, orders, canCreate: s.perm.create });
}

const Body = z.object({
  customerName: z.string().trim().min(1, "Cần tên khách").max(200),
  customerPhone: z.string().trim().max(40).catch(""),
  address: z.string().trim().max(500).catch(""),
  note: z.string().trim().max(2000).catch(""),
  items: z.array(z.record(z.string(), z.unknown())).min(1, "Cần ít nhất một sản phẩm").max(200),
  discount: z.coerce.number().min(0).catch(0),
  voucherCode: z.string().trim().max(60).catch(""),
  /** Gửi tin xác nhận đơn cho khách sau khi tạo. */
  confirmText: z.string().trim().max(2000).catch(""),
});

/**
 * Tạo đơn hàng từ hội thoại: dùng đúng API /api/orders (quyền, mã giảm giá, đánh số) rồi
 * đánh dấu hội thoại "đã tạo đơn", ghi chú nội bộ, và (tuỳ chọn) gửi tin xác nhận cho khách.
 */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  const note = [d.address && `Giao tới: ${d.address}`, d.note, `Tạo từ hội thoại ${conv.name}`].filter(Boolean).join("\n");
  const res = await createOrder(
    new Request(new URL("/api/orders", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: conv.recordId, customerName: d.customerName, customerPhone: d.customerPhone, items: d.items, discount: d.discount, voucherCode: d.voucherCode || undefined, note }),
    }),
  );
  if (!res) return fail("Không tạo được đơn");
  const order = (await res.json().catch(() => ({}))) as { id?: string; number?: string; total?: number; error?: string };
  if (!res.ok || !order.id) return fail(order.error ?? "Không tạo được đơn", res.status >= 400 ? res.status : 400);

  await db.conversation.update({ where: { id: conv.id }, data: { orderMarked: true } });
  await addNote(a.ctx, conv, `Đã tạo đơn ${order.number} · ${(order.total ?? 0).toLocaleString("vi-VN")} ₫`).catch(() => null);
  let confirm: { ok: boolean; error?: string } | null = null;
  // Hội thoại bình luận: sendReply sẽ trả lời công khai dưới bình luận, không hợp để gửi xác nhận đơn → bỏ qua (nhân viên dùng "Nhắn riêng").
  if (d.confirmText && conv.kind === "comment") confirm = { ok: false, error: "Hội thoại bình luận: hãy gửi xác nhận bằng “Nhắn riêng”" };
  else if (d.confirmText) {
    // Chữ ký trang do sendReply tự thêm.
    const text = d.confirmText.replace(/\{ma_don\}/g, order.number ?? "").replace(/\{tong_tien\}/g, `${(order.total ?? 0).toLocaleString("vi-VN")} ₫`);
    const r = await sendReply(a.ctx, conv, text);
    if (!r.error) await db.conversation.update({ where: { id: conv.id }, data: { lastOutAt: r.message.createdAt, ...(conv.firstReplyAt ? {} : { firstReplyAt: r.message.createdAt }) } }).catch(() => {});
    confirm = { ok: !r.error, error: r.error || undefined };
  }
  return ok({ order: { id: order.id, number: order.number, total: order.total }, confirm }, 201);
}
