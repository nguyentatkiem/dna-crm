import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getRole } from "@/lib/permissions";
import { notify, userIdByName } from "@/lib/notify";
import { notifyMentions } from "@/lib/mentions";
import { canDeletePost } from "@/lib/feed";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ body: z.string().trim().min(1, "Hãy viết bình luận").max(2000) });

export async function POST(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const post = await db.post.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!post) return fail("Không tìm thấy bài", 404);
  const c = await db.postComment.create({ data: { postId: id, author: ctx.user.name, body: p.data.body } });
  const href = `/w/feed#post-${id}`;
  const told = await notifyMentions(ctx.workspace.id, ctx.user, c.body, { title: "Bảng tin", href });
  // Báo tác giả bài (nếu chưa được báo qua @nhắc).
  if (post.author !== ctx.user.name && !told.includes(post.author)) {
    const userId = await userIdByName(ctx.workspace.id, post.author);
    if (userId) await notify(ctx.workspace.id, { userId, kind: "feed", text: `${ctx.user.name} bình luận bài của bạn: ${c.body.slice(0, 120)}`, href });
  }
  return ok({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt.toISOString() }, 201);
}

/** Xoá bình luận: ?cid=… (người viết hoặc chủ/quản lý). */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const { id } = await params;
  const cid = new URL(req.url).searchParams.get("cid") ?? "";
  const c = await db.postComment.findFirst({ where: { id: cid, postId: id, post: { workspaceId: ctx.workspace.id } } });
  if (!c) return fail("Không tìm thấy bình luận", 404);
  const manager = (await getRole(ctx.user.id, ctx.workspace.id)) !== "member";
  if (!canDeletePost(c.author, ctx.user.name, manager)) return fail("Bạn chỉ xoá được bình luận của mình", 403);
  await db.postComment.delete({ where: { id: cid } });
  return ok({ ok: true });
}
