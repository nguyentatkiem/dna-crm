import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { addNote, sendReply } from "@/lib/inbox";
import { findVisibleConversation } from "@/lib/inbox-list";

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  note: z.boolean().optional(),
  humanAgent: z.boolean().optional(),
  /** Mẫu trả lời nhanh đã dùng (tăng số lần dùng). */
  quickReplyId: z.string().max(60).optional(),
});

/** Gửi tin cho khách qua đúng kênh, hoặc ghi chú nội bộ (note: true). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Tin nhắn trống hoặc quá dài (tối đa 2000 ký tự)");
  if (p.data.quickReplyId) await db.quickReply.updateMany({ where: { id: p.data.quickReplyId, workspaceId: a.ctx.workspace.id }, data: { uses: { increment: 1 } } }).catch(() => {});
  if (p.data.note) {
    const m = await addNote(a.ctx, conv, p.data.text);
    return ok({ ok: true, id: m.id });
  }
  // Chữ ký trang (Messenger) do sendReply tự thêm (withSignature ở src/lib/fb/pages.ts).
  const text = p.data.text;
  const r = await sendReply(a.ctx, conv, text, { humanAgent: p.data.humanAgent });
  if (!r.error) {
    // Mốc trả lời cho bộ lọc "chưa trả lời" và thống kê thời gian phản hồi.
    const at = r.message.createdAt;
    await db.conversation.update({ where: { id: conv.id }, data: { lastOutAt: at, readAt: at, unread: 0, ...(conv.firstReplyAt || !conv.lastInAt ? {} : { firstReplyAt: at }) } }).catch(() => {});
  }
  // Vẫn trả 200 khi gửi lỗi: tin đã lưu với trạng thái failed để người dùng thấy và gửi lại.
  return ok({ ok: !r.error, id: r.message.id, error: r.error, windowClosed: r.windowClosed, text });
}
