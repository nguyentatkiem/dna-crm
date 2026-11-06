import { z } from "zod";
import { audit } from "@/lib/audit";
import { appApi, fail, ok } from "@/lib/http";
import { findConversation } from "@/lib/inbox";
import { accessOf, allow } from "@/lib/permissions";
import { COMMENT_ACTIONS, commentAction } from "@/lib/fb/comments";

type P = { params: Promise<{ id: string }> };

const Body = z.object({
  action: z.enum(COMMENT_ACTIONS),
  messageId: z.string().max(60).optional(),
  text: z.string().max(8000).optional(),
});

const LABEL: Record<(typeof COMMENT_ACTIONS)[number], string> = {
  reply: "trả lời bình luận",
  private_reply: "nhắn riêng từ bình luận",
  hide: "ẩn bình luận",
  unhide: "hiện bình luận",
  like: "thích/bỏ thích bình luận",
  delete: "xoá bình luận",
  mark_order: "đổi đánh dấu tạo đơn",
};

/**
 * Thao tác bình luận fanpage của một hội thoại (kind "comment").
 * Body { action, messageId?, text? } — messageId = Message.id của bình luận đích (bỏ trống = bình luận gần nhất của khách).
 * Trả { ok, action, message, target, conversation, inboxConversationId?, simulated }.
 * Ẩn/hiện/xoá cần quyền comment_moderate. Lỗi Facebook → 502 { error, message? }.
 */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const { action, messageId, text } = p.data;
  if (["hide", "unhide", "delete"].includes(action) && !allow(await accessOf(a.ctx), "comment_moderate")) return fail("Bạn không có quyền ẩn/xoá bình luận", 403);
  if (action !== "mark_order" && conv.kind !== "comment" && !messageId) return fail("Hội thoại này không phải bình luận");
  const r = await commentAction(conv, action, { messageId, text, actor: a.ctx.user.name });
  if (!r.ok) return Response.json({ error: r.error, message: r.message ?? null }, { status: r.status });
  if (action === "delete" || action === "private_reply")
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "conversation", conv.id, `Hội thoại ${conv.name}: ${LABEL[action]}${r.simulated ? " (chạy thử)" : ""}`);
  return ok(r);
}
