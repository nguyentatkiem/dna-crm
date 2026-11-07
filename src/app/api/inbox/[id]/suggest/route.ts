import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation } from "@/lib/inbox-list";
import { canManageKb } from "@/lib/kb/api";
import { markUsed, suggestFor } from "@/lib/kb/suggest";

const Body = z.object({
  /** true: nhờ Claude viết theo ngữ cảnh (tốn token); mặc định chỉ lấy câu trả lời có sẵn trong kho. */
  ai: z.boolean().optional(),
  /** Nhân viên đã chèn gợi ý dùng các nguồn này → tăng lượt dùng, không trả gợi ý. */
  used: z.array(z.string()).max(10).optional(),
});

/**
 * Gợi ý trả lời bám kho kiến thức cho hội thoại.
 * → { suggestions: [{ text, sources: [{ id, title }], confidence, origin }], query, aiAvailable, origin, canManageKb }
 * Chỉ soạn, không gửi. SĐT/email của khách được che trước khi gửi cho AI.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  if (p.data.used?.length) {
    await markUsed(p.data.used);
    return ok({ ok: true });
  }
  const [r, canManage] = await Promise.all([suggestFor(conv, { useAi: !!p.data.ai }), canManageKb(a.ctx)]);
  return ok({ ...r, canManageKb: canManage });
}
