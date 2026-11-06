import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";

const Body = z.object({ ids: z.array(z.string()).min(1).max(50), name: z.string().trim().max(80).optional(), unmerge: z.boolean().optional() });

/**
 * Gộp nhiều bài (thường là các phiên livestream / bài chạy cùng sản phẩm) để xem bình luận chung.
 * { ids, name? } → cùng mergeKey; { ids, unmerge: true } → tách ra. Cần inbox_settings.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "inbox_settings")) return fail("Bạn không có quyền gộp bài viết", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Chọn ít nhất một bài viết");
  const { ids, unmerge } = p.data;
  if (!unmerge && ids.length < 2) return fail("Chọn ít nhất 2 bài để gộp");
  const key = unmerge ? "" : p.data.name || `Gộp ${new Date().toLocaleDateString("vi-VN")}`;
  const r = await db.fbPost.updateMany({ where: { workspaceId: a.ctx.workspace.id, id: { in: ids } }, data: { mergeKey: key } });
  const posts = await db.fbPost.findMany({ where: { workspaceId: a.ctx.workspace.id, id: { in: ids } }, select: { postId: true } });
  return ok({ updated: r.count, mergeKey: key, inboxHref: key ? `/w/inbox?post=${posts.map((x) => encodeURIComponent(x.postId)).join(",")}` : "" });
}
