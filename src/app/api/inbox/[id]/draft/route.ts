import { appApi, fail, ok } from "@/lib/http";
import { draftReply } from "@/lib/inbox";
import { findVisibleConversation } from "@/lib/inbox-list";

/** AI soạn câu trả lời (dự phòng: mẫu câu theo ý định khi chưa có API key). Chỉ soạn, không gửi. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  return ok(await draftReply(conv, a.ctx.config));
}
