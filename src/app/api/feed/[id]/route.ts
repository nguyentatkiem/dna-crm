import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { canDeletePost, postDTO } from "@/lib/feed";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({ pinned: z.boolean() });

/** Ghim / bỏ ghim (chủ, quản lý). */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const { id } = await params;
  if (!allow(await getAccess(ctx.user.id, ctx.workspace.id), "feed_moderate")) return fail("Bạn chưa có quyền ghim bài", 403);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const post = await db.post.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!post) return fail("Không tìm thấy bài", 404);
  const updated = await db.post.update({ where: { id }, data: { pinned: p.data.pinned }, include: { comments: true } });
  return ok(postDTO(updated));
}

/** Xoá bài: tác giả hoặc chủ/quản lý. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const { id } = await params;
  const post = await db.post.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!post) return fail("Không tìm thấy bài", 404);
  const manager = allow(await getAccess(ctx.user.id, ctx.workspace.id), "feed_moderate");
  if (!canDeletePost(post.author, ctx.user.name, manager)) return fail("Bạn chỉ xoá được bài của mình", 403);
  await db.post.delete({ where: { id } });
  if (post.author !== ctx.user.name) await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "delete", "post", id, `Xoá bài của ${post.author} trên bảng tin: “${post.body.slice(0, 80)}”`);
  return ok({ ok: true });
}
