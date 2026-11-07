import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation } from "@/lib/inbox-list";
import { findAccount } from "@/lib/channels/accounts";
import { fillWaTemplate, listWaTemplates, sendWaTemplate, WaError } from "@/lib/channels/whatsapp";

const Body = z.object({
  conversationId: z.string().min(1).max(60),
  /** Tên mẫu (vd. "nhac_lich_hen"); language mặc định theo mẫu tìm được. */
  template: z.string().trim().min(1).max(512),
  language: z.string().trim().max(20).optional(),
  params: z.array(z.string().trim().max(1000)).max(20).default([]),
});

/**
 * Gửi mẫu tin WhatsApp đã duyệt (dùng khi cửa sổ 24 giờ đã đóng, hoặc chủ động nhắn trước).
 * Lưu Message (sent/failed) với bản xem trước đã điền biến; trạng thái delivered/read cập nhật qua webhook.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const conv = await findVisibleConversation(a.ctx, p.data.conversationId);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  if (conv.channel !== "whatsapp") return fail("Hội thoại không phải WhatsApp");
  const acc = await findAccount(a.ctx.workspace.id, "whatsapp", conv.pageId);
  if (!acc || !acc.active) return fail("Số WhatsApp của hội thoại chưa kết nối hoặc đang tắt", 409);

  let tpl: { name: string; language: string; body: string; params: number } | undefined;
  try {
    const { items } = await listWaTemplates(acc);
    tpl = items.find((t) => t.name === p.data.template && t.status === "APPROVED" && (!p.data.language || t.language === p.data.language));
  } catch (e) {
    return fail(e instanceof WaError ? e.message : "Không tải được mẫu tin", 502);
  }
  if (!tpl) return fail("Mẫu tin không tồn tại hoặc chưa được duyệt", 404);
  const params = p.data.params.slice(0, tpl.params);
  if (params.length < tpl.params || params.some((x) => !x)) return fail(`Mẫu “${tpl.name}” cần đủ ${tpl.params} biến`);

  const preview = fillWaTemplate(tpl.body, params);
  let externalId = "";
  let error = "";
  try {
    externalId = await sendWaTemplate(acc, conv.externalId, tpl, params);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const msg = await db.message.create({
    data: { conversationId: conv.id, direction: "out", text: preview, externalId, author: a.ctx.user.name, status: error ? "failed" : "sent", error, attachmentsJson: JSON.stringify([{ type: "event", name: `Mẫu tin ${tpl.name}` }]) },
  });
  if (!error) {
    await db.conversation.update({
      where: { id: conv.id },
      data: { lastText: `Bạn: ${preview.slice(0, 200)}`, lastAt: msg.createdAt, lastOutAt: msg.createdAt, readAt: msg.createdAt, unread: 0, assignee: conv.assignee || a.ctx.user.name },
    });
    if (conv.recordId) await db.activity.create({ data: { recordId: conv.recordId, kind: "update", body: `Đã gửi mẫu tin WhatsApp “${tpl.name}”: ${preview}`, author: a.ctx.user.name } }).catch(() => {});
  }
  return ok({ ok: !error, id: msg.id, error, text: preview });
}
