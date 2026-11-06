import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getInboxTags, setInboxTags } from "@/lib/inbox-list";
import { allowed } from "@/lib/permissions";
import { cleanTopics, parseTags } from "@/lib/quick-replies";

/** Danh mục thẻ hội thoại (Pref "inboxTags"): [{ key, name, color }]. Ai cũng xem/gắn được. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok({ tags: await getInboxTags(a.ctx.workspace.id), canManage: await allowed(a.ctx, "quick_reply_manage") });
}

const Body = z.object({ tags: z.array(z.object({ key: z.string().max(40).optional(), name: z.string().max(40), color: z.string().max(20) })).max(100) });

/** Lưu cả danh mục thẻ (thêm / đổi tên / đổi màu / xoá / sắp xếp). Thẻ bị xoá được gỡ khỏi mọi hội thoại. Cần quyền quick_reply_manage. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền quản lý thẻ hội thoại", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Danh sách thẻ không hợp lệ");
  const wid = a.ctx.workspace.id;
  const before = await getInboxTags(wid);
  const next = cleanTopics(p.data.tags);
  await setInboxTags(wid, next);
  const removed = before.filter((t) => !next.some((n) => n.key === t.key)).map((t) => t.key);
  for (const key of removed) {
    const convs = await db.conversation.findMany({ where: { workspaceId: wid, tagsJson: { contains: JSON.stringify(key) } }, select: { id: true, tagsJson: true } });
    for (const c of convs) await db.conversation.update({ where: { id: c.id }, data: { tagsJson: JSON.stringify(parseTags(c.tagsJson).filter((t) => t !== key)) } });
  }
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "inbox_tags", "inboxTags", `Cập nhật thẻ hội thoại (${next.length} thẻ${removed.length ? `, xoá ${removed.length}` : ""})`);
  return ok({ tags: next });
}
