import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { notify, userIdByName } from "@/lib/notify";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { sendMessage } from "@/lib/marketing/messaging";
import { canEditDoc, docScope, notifyManagers, scoped } from "@/lib/sales/access";
import { acceptQuote, orderFromQuote, originOf } from "@/lib/sales/service";
import { money, quoteExpired } from "@/lib/sales/shared";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  action: z.enum(["submit", "approve", "reject", "send", "message", "accept", "order", "duplicate"]),
  reason: z.string().max(500).optional(),
  name: z.string().max(120).optional(),
  channel: z.enum(["zalo", "email", "sms"]).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Thao tác không hợp lệ");
  const { action } = p.data;
  const s = await docScope(a.ctx);
  const q = await db.quote.findFirst({ where: scoped(s.where, { id }) });
  if (!q) return fail("Không tìm thấy báo giá", 404);
  const wid = a.ctx.workspace.id;
  const who = { workspaceId: wid, user: a.ctx.user };
  const me = a.ctx.user.name;
  const mine = canEditDoc(a.ctx, s.seeAll, q);
  const tellCreator = async (text: string) => {
    if (q.createdBy === me) return;
    await notify(wid, { userId: await userIdByName(wid, q.createdBy), kind: "quote", text, href: `/w/quotes/${q.id}` });
  };

  if (action === "submit") {
    if (!mine) return fail("Chỉ người tạo được gửi duyệt", 403);
    if (q.status !== "draft") return fail("Chỉ báo giá nháp mới gửi duyệt được", 409);
    if (s.seeAll) return ok(await approve());
    const up = await db.quote.update({ where: { id }, data: { status: "pending", rejectReason: "" } });
    await audit(who, "quote.submit", "quote", id, `Gửi duyệt báo giá ${q.number}`);
    await notifyManagers(wid, id, `${me} gửi duyệt báo giá ${q.number} (${q.customerName})`);
    return ok(up);
  }

  if (action === "approve") {
    if (!s.seeAll) return fail("Chỉ chủ và quản lý được duyệt báo giá", 403);
    if (!["draft", "pending"].includes(q.status)) return fail("Báo giá này không ở trạng thái chờ duyệt", 409);
    return ok(await approve());
  }

  if (action === "reject") {
    if (!s.seeAll) return fail("Chỉ chủ và quản lý được trả lại báo giá", 403);
    if (q.status !== "pending") return fail("Báo giá này không ở trạng thái chờ duyệt", 409);
    const reason = p.data.reason?.trim() ?? "";
    // Không duyệt thì trả về nháp kèm lý do để người tạo sửa; "rejected" để dành cho khách từ chối.
    const up = await db.quote.update({ where: { id }, data: { status: "draft", rejectReason: reason ? `Quản lý: ${reason}` : "Quản lý chưa duyệt", approvedBy: "", approvedAt: null } });
    await audit(who, "quote.reject", "quote", id, `Không duyệt báo giá ${q.number}${reason ? `: ${reason}` : ""}`);
    await tellCreator(`${me} chưa duyệt báo giá ${q.number}${reason ? `: ${reason}` : ""}`);
    return ok(up);
  }

  if (action === "send" || action === "message") {
    if (!mine) return fail("Chỉ người tạo hoặc quản lý được gửi báo giá", 403);
    if (quoteExpired(q)) return fail("Báo giá đã hết hạn. Hãy sửa ngày hiệu lực trước khi gửi.", 409);
    // Nhân viên phải được duyệt trước khi gửi khách; quản lý gửi thẳng được từ nháp.
    const sendable = q.status === "approved" || q.status === "sent" || (s.seeAll && q.status === "draft");
    if (!sendable) return fail(q.status === "pending" ? "Báo giá đang chờ duyệt, chưa gửi được" : q.status === "draft" ? "Hãy gửi duyệt trước khi gửi khách" : "Báo giá đã chốt, không cần gửi lại", 409);
    const link = `${originOf(await headers(), new URL(req.url).origin)}/q/${q.publicToken}`;
    let up = q;
    if (q.status !== "sent") {
      up = await db.quote.update({ where: { id }, data: { status: "sent", ...(q.status === "draft" ? { approvedBy: me, approvedAt: new Date() } : {}) } });
      await audit(who, "quote.send", "quote", id, `Gửi báo giá ${q.number} cho ${q.customerName}`);
    }
    if (action === "send") return ok({ ...up, link });
    const channel = p.data.channel ?? "zalo";
    const company = await getPref<Company>(wid, "company", COMPANY_DEFAULT);
    const from = company.name || a.ctx.config.businessName || a.ctx.workspace.name;
    const body = `Kính gửi ${q.customerName},\n${from} gửi anh/chị báo giá ${q.number}${q.title ? ` – ${q.title}` : ""}, tổng ${money(q.total)}.\nXem và xác nhận tại: ${link}`;
    const to = channel === "email" ? q.customerEmail : channel === "sms" ? q.customerPhone : undefined;
    if (channel === "email" && !to) return fail("Báo giá chưa có email khách");
    if (channel === "zalo" && !q.contactId) return fail("Báo giá chưa gắn với khách trong CRM nên chưa biết Zalo của khách");
    const r = await sendMessage(wid, { channel, recordId: q.contactId ?? undefined, to, subject: `Báo giá ${q.number} từ ${from}`, body });
    await audit(who, "quote.message", "quote", id, `Gửi báo giá ${q.number} qua ${channel}: ${r.ok ? (r.error ?? "đã gửi") : r.error}`);
    return ok({ ...up, link, sent: r.ok, skipped: !!r.skipped, message: r.ok ? (r.error ?? "Đã gửi cho khách") : (r.error ?? "Gửi không thành công") });
  }

  if (action === "accept") {
    if (!mine) return fail("Chỉ người tạo hoặc quản lý được ghi nhận khách đồng ý", 403);
    if (!["approved", "sent"].includes(q.status)) return fail("Chỉ ghi nhận được với báo giá đã duyệt hoặc đã gửi", 409);
    const r = await acceptQuote(q, p.data.name?.trim() || q.customerName, a.ctx.user);
    return ok({ ...(await db.quote.findUnique({ where: { id } })), orderId: r.orderId });
  }

  if (action === "order") {
    if (!["approved", "sent", "accepted"].includes(q.status)) return fail("Báo giá cần được duyệt trước khi tạo đơn", 409);
    const order = await orderFromQuote(q, a.ctx.user);
    return ok({ orderId: order.id, number: order.number });
  }

  // duplicate: bản sao nháp, số mới, hiệu lực mới.
  const number = await nextNumber(wid, "BG");
  const copy = await db.quote.create({
    data: {
      workspaceId: wid,
      number,
      recordId: q.recordId,
      contactId: q.contactId,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      customerEmail: q.customerEmail,
      title: q.title,
      itemsJson: q.itemsJson,
      discount: q.discount,
      subtotal: q.subtotal,
      vatTotal: q.vatTotal,
      total: q.total,
      validUntil: new Date(Date.now() + 15 * 864e5),
      note: q.note,
      terms: q.terms,
      createdBy: me,
    },
  });
  await audit(who, "quote.create", "quote", copy.id, `Nhân bản báo giá ${q.number} thành ${number}`);
  return ok(copy, 201);

  async function approve() {
    const up = await db.quote.update({ where: { id }, data: { status: "approved", approvedBy: me, approvedAt: new Date(), rejectReason: "" } });
    await audit(who, "quote.approve", "quote", id, `Duyệt báo giá ${q!.number}`);
    await tellCreator(`${me} đã duyệt báo giá ${q!.number}, bạn có thể gửi khách`);
    return up;
  }
}
