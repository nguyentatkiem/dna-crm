import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { conversationWhere } from "@/lib/chat/visibility";
import { detectContact } from "@/lib/chat/detect";

/**
 * Dòng bình luận chung của một hoặc nhiều bài (xem gộp livestream): ?posts=<postId>,<postId>&after=<ISO>.
 * Trả bình luận mới nhất trước, kèm hội thoại để mở / thao tác qua /api/inbox/[id]/comment.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const posts = (sp.get("posts") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  if (!posts.length) return fail("Chọn bài viết");
  const after = sp.get("after") ? new Date(sp.get("after")!) : null;
  const scope = await conversationWhere(a.ctx);
  const msgs = await db.message.findMany({
    where: {
      kind: "comment",
      ...(after && !isNaN(after.getTime()) ? { createdAt: { gt: after } } : {}),
      conversation: { AND: [scope, { kind: "comment", postId: { in: posts } }] },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { conversation: { select: { id: true, name: true, postId: true, phones: true, orderMarked: true, privateReplied: true, recordId: true, assignee: true } } },
  });
  return ok({
    items: msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      author: m.author,
      hidden: m.hidden,
      liked: m.liked,
      status: m.status,
      parentId: m.parentId,
      commentId: m.commentId,
      at: m.createdAt.toISOString(),
      hasPhone: m.direction === "in" && detectContact(m.text).phones.length > 0,
      conversation: m.conversation,
    })),
  });
}
