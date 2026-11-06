import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation, getInboxTags, inboxDetail } from "@/lib/inbox-list";
import { accessOf, allow, recordScope } from "@/lib/permissions";
import { parseTags } from "@/lib/quick-replies";

type P = { params: Promise<{ id: string }> };

/** Tin nhắn / bình luận + bài viết + thẻ khách. Không tự đánh dấu đã đọc (giao diện gọi PATCH { read: true } khi mở). */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  return ok(await inboxDetail(conv, a.ctx.config));
}

const Patch = z.object({
  status: z.enum(["open", "done"]).optional(),
  assignee: z.string().max(120).optional(),
  recordId: z.string().nullable().optional(),
  read: z.boolean().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  orderMarked: z.boolean().optional(),
});

/**
 * Đổi trạng thái, giao người (cần quyền inbox_assign; tự nhận hội thoại chưa giao thì không cần),
 * gắn/bỏ gắn khách, đánh dấu đã đọc / chưa đọc, gắn thẻ, đánh dấu tạo đơn.
 * Trả các trường đã đổi để giao diện cập nhật lạc quan.
 */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const { status, assignee, recordId, read, tags, orderMarked } = p.data;
  const me = a.ctx.user.name;
  const data: { status?: string; assignee?: string; recordId?: string | null; unread?: number; readAt?: Date | null; tagsJson?: string; orderMarked?: boolean } = {};
  if (status) {
    data.status = status;
    if (status === "done") data.unread = 0;
  }
  if (assignee !== undefined && assignee !== conv.assignee) {
    const selfClaim = !conv.assignee && assignee === me;
    if (!selfClaim && !allow(await accessOf(a.ctx), "inbox_assign")) return fail("Bạn chưa có quyền phân công hội thoại. Bạn vẫn có thể “Nhận hội thoại” chưa giao.", 403);
    if (assignee && !a.ctx.config.team.includes(assignee) && assignee !== me) return fail("Người này không có trong đội ngũ");
    data.assignee = assignee;
  }
  if (recordId !== undefined) {
    if (recordId && !(await db.record.findFirst({ where: { AND: [{ id: recordId }, await recordScope(a.ctx)] }, select: { id: true } }))) return fail("Không tìm thấy khách", 404);
    data.recordId = recordId;
  }
  if (read === true) {
    data.readAt = new Date();
    data.unread = 0;
  } else if (read === false) {
    data.readAt = null;
    data.unread = Math.max(1, conv.unread);
  }
  if (tags) {
    const known = new Set((await getInboxTags(a.ctx.workspace.id)).map((t) => t.key));
    // Chỉ nhận thẻ có trong danh mục (thẻ đã xoá tự rơi khỏi hội thoại ở lần sửa tiếp theo).
    data.tagsJson = JSON.stringify([...new Set(tags.filter((t) => known.has(t)))]);
  }
  if (orderMarked !== undefined) data.orderMarked = orderMarked;
  if (!Object.keys(data).length) return ok({ ok: true });
  const next = await db.conversation.update({ where: { id: conv.id }, data });

  // Chỉ ghi nhật ký cho thay đổi có ý nghĩa (đọc/chưa đọc thì bỏ qua).
  const parts = [
    status && (status === "done" ? "đánh dấu đã xong" : "mở lại"),
    data.assignee !== undefined && (data.assignee ? `giao cho ${data.assignee}` : "bỏ giao"),
    recordId !== undefined && (recordId ? "gắn khách" : "bỏ gắn khách"),
    tags && "đổi thẻ",
    orderMarked !== undefined && (orderMarked ? "đánh dấu tạo đơn" : "bỏ đánh dấu tạo đơn"),
  ].filter(Boolean);
  if (parts.length) await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "conversation", conv.id, `Hội thoại ${conv.name}: ${parts.join(", ")}`);
  return ok({
    ok: true,
    status: next.status,
    assignee: next.assignee,
    recordId: next.recordId,
    unread: next.unread,
    readAt: next.readAt?.toISOString() ?? null,
    tags: parseTags(next.tagsJson),
    orderMarked: next.orderMarked,
  });
}
