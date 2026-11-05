import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { addNote, findConversation, sendReply } from "@/lib/inbox";

const Body = z.object({ text: z.string().trim().min(1).max(2000), note: z.boolean().optional(), humanAgent: z.boolean().optional() });

/** Gửi tin cho khách qua đúng kênh, hoặc ghi chú nội bộ (note: true). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Tin nhắn trống hoặc quá dài (tối đa 2000 ký tự)");
  if (p.data.note) {
    const m = await addNote(a.ctx, conv, p.data.text);
    return ok({ ok: true, id: m.id });
  }
  const r = await sendReply(a.ctx, conv, p.data.text, { humanAgent: p.data.humanAgent });
  // Vẫn trả 200 khi gửi lỗi: tin đã lưu với trạng thái failed để người dùng thấy và gửi lại.
  return ok({ ok: !r.error, id: r.message.id, error: r.error, windowClosed: r.windowClosed });
}
