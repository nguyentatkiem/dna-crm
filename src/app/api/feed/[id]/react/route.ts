import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { parseReactions, REACTIONS, toggleReaction } from "@/lib/feed";

const Body = z.object({ emoji: z.enum(REACTIONS) });

/** Bật/tắt một cảm xúc của người đang đăng nhập. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Cảm xúc không hợp lệ");
  // Đọc rồi ghi trong một giao dịch để hai người bấm cùng lúc không mất lượt.
  const out = await db.$transaction(async (tx) => {
    const post = await tx.post.findFirst({ where: { id, workspaceId: a.ctx.workspace.id }, select: { reactionsJson: true } });
    if (!post) return null;
    const next = toggleReaction(parseReactions(post.reactionsJson), p.data.emoji, a.ctx.user.name);
    await tx.post.update({ where: { id }, data: { reactionsJson: JSON.stringify(next) } });
    return next;
  });
  if (!out) return fail("Không tìm thấy bài", 404);
  return ok({ reactions: out });
}
