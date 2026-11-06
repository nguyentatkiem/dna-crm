import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { postDTO } from "@/lib/fb/admin";
import { PostSettings, postSettings } from "@/lib/fb/pages";

type P = { params: Promise<{ id: string }> };

const Patch = z.object({
  settings: PostSettings.partial().optional(),
  topic: z.string().trim().max(80).optional(),
  mergeKey: z.string().trim().max(80).optional(),
});

/** Cài đặt riêng của bài viết: tự ẩn, tự thích, bỏ qua, tự trả lời bình luận / nhắn riêng (biến {ten}), chủ đề, gộp. Cần inbox_settings. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "inbox_settings")) return fail("Bạn không có quyền cài đặt bài viết", 403);
  const post = await db.fbPost.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!post) return fail("Không tìm thấy bài viết", 404);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const settings = p.data.settings ? { ...postSettings(post), ...p.data.settings } : undefined;
  const next = await db.fbPost.update({
    where: { id: post.id },
    data: { ...(settings ? { settingsJson: JSON.stringify(settings) } : {}), ...(p.data.topic !== undefined ? { topic: p.data.topic } : {}), ...(p.data.mergeKey !== undefined ? { mergeKey: p.data.mergeKey } : {}) },
  });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "fbPost", post.id, `Cài đặt bài viết ${post.message.slice(0, 40) || post.postId}`);
  return ok({ item: postDTO(next) });
}
