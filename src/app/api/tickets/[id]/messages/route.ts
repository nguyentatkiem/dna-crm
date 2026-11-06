import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { sendMessage } from "@/lib/marketing/messaging";
import { findTicket } from "@/lib/care/server";

type P = { params: Promise<{ id: string }> };

const Body = z.object({
  body: z.string().trim().min(1, "Nhập nội dung").max(5000),
  internal: z.boolean().default(false),
  // Gửi kèm trả lời cho khách qua kênh này (chỉ với trả lời công khai).
  sendVia: z.enum(["zalo", "email", "sms"]).optional(),
});

/** Thêm trả lời (công khai) hoặc ghi chú nội bộ. Phiếu đang "Mở" mà trả lời khách thì chuyển sang "Đang chờ khách". */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await findTicket(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy phiếu", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const { body, internal, sendVia } = p.data;
  const m = await db.ticketMessage.create({ data: { ticketId: t.id, author: a.ctx.user.name, body, internal } });

  let send: { ok: boolean; error?: string; skipped?: boolean } | null = null;
  if (!internal && sendVia) {
    if (!t.recordId) send = { ok: false, error: "Phiếu chưa gắn khách nên không biết gửi cho ai" };
    else send = await sendMessage(a.ctx.workspace.id, { channel: sendVia, recordId: t.recordId, subject: `[${t.number}] ${t.subject}`, body });
  }
  let status = t.status;
  if (!internal && t.status === "open") {
    status = "pending";
    await db.ticket.update({ where: { id: t.id }, data: { status } });
  } else await db.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date() } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, internal ? "ticket.note" : "ticket.reply", "ticket", t.id, `Phiếu ${t.number}: ${internal ? "ghi chú nội bộ" : "trả lời khách"}${send ? (send.ok ? ` (đã gửi ${sendVia})` : ` (gửi ${sendVia} lỗi)`) : ""}`);
  return ok({ message: { id: m.id, author: m.author, body: m.body, internal: m.internal, at: m.createdAt.toISOString() }, status, send }, 201);
}
