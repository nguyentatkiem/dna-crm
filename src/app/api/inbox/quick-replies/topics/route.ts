import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getQuickTopics, setQuickTopics } from "@/lib/inbox-list";
import { allowed } from "@/lib/permissions";
import { cleanTopics } from "@/lib/quick-replies";

const Body = z.object({ topics: z.array(z.object({ key: z.string().max(40).optional(), name: z.string().max(40), color: z.string().max(20) })).max(100) });

/** Lưu cả danh sách chủ đề (Pref "quickReplyTopics"): thêm, đổi tên/màu, xoá, kéo thả thứ tự. Mẫu của chủ đề bị xoá chuyển về "Chưa phân loại". */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền sửa chủ đề", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Danh sách chủ đề không hợp lệ");
  const wid = a.ctx.workspace.id;
  const before = await getQuickTopics(wid);
  const next = cleanTopics(p.data.topics);
  await setQuickTopics(wid, next);
  const removed = before.filter((t) => !next.some((n) => n.key === t.key)).map((t) => t.key);
  if (removed.length) await db.quickReply.updateMany({ where: { workspaceId: wid, topic: { in: removed } }, data: { topic: "" } });
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "quick_reply_topics", "quickReplyTopics", `Cập nhật chủ đề trả lời nhanh (${next.length})`);
  return ok({ topics: next });
}
