import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { conversationWhere } from "@/lib/chat/visibility";
import { postDTO } from "@/lib/fb/admin";

/**
 * Bài viết của các trang. Lọc: page (pageId), kind (post|photo|video|live), q, phone=1 (có bình luận để SĐT), merge (mergeKey).
 * Sắp xếp: sort = recent (mặc định) | comments | phones | unread.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const sp = new URL(req.url).searchParams;
  const where: Prisma.FbPostWhereInput = { workspaceId: wid };
  const page = sp.get("page");
  if (page) where.pageId = page;
  const kind = sp.get("kind");
  if (kind === "live") where.live = true;
  else if (kind && ["post", "photo", "video"].includes(kind)) Object.assign(where, { kind, live: false });
  const q = sp.get("q")?.trim();
  if (q) where.OR = [{ message: { contains: q } }, { postId: { contains: q } }, { topic: { contains: q } }];
  if (sp.get("phone") === "1") where.phonesCount = { gt: 0 };
  const merge = sp.get("merge");
  if (merge) where.mergeKey = merge;
  const sort = sp.get("sort") ?? "recent";
  const orderBy: Prisma.FbPostOrderByWithRelationInput =
    sort === "comments" ? { commentsCount: "desc" } : sort === "phones" ? { phonesCount: "desc" } : { postedAt: "desc" };
  const rows = await db.fbPost.findMany({ where, orderBy, take: 300 });
  const [pages, scope] = await Promise.all([db.fbPage.findMany({ where: { workspaceId: wid }, select: { pageId: true, name: true } }), conversationWhere(a.ctx)]);
  const conv = rows.length
    ? await db.conversation.groupBy({ by: ["postId"], where: { AND: [scope, { kind: "comment", postId: { in: rows.map((r) => r.postId) } }] }, _count: { _all: true }, _sum: { unread: true } })
    : [];
  const byPost = new Map(conv.map((c) => [c.postId, c]));
  const names = new Map(pages.map((p) => [p.pageId, p.name]));
  let items = rows.map((r) => postDTO(r, { pageName: names.get(r.pageId) ?? "", conversations: byPost.get(r.postId)?._count._all ?? 0, unread: byPost.get(r.postId)?._sum.unread ?? 0 }));
  if (sort === "unread") items = items.sort((x, y) => y.unread - x.unread);
  const acc = await accessOf(a.ctx);
  const totals = {
    all: await db.fbPost.count({ where: { workspaceId: wid } }),
    live: await db.fbPost.count({ where: { workspaceId: wid, live: true } }),
    video: await db.fbPost.count({ where: { workspaceId: wid, kind: "video", live: false } }),
    photo: await db.fbPost.count({ where: { workspaceId: wid, kind: "photo", live: false } }),
    post: await db.fbPost.count({ where: { workspaceId: wid, kind: "post", live: false } }),
  };
  return ok({ items, pages, totals, canSettings: allow(acc, "inbox_settings") });
}
