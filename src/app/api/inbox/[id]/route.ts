import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { conversationDetail, findConversation } from "@/lib/inbox";
import { recordScope } from "@/lib/permissions";

type P = { params: Promise<{ id: string }> };

/** Tin nhắn + thẻ khách. Mở hội thoại = đánh dấu đã đọc. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  let conv = await findConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  if (conv.unread) conv = await db.conversation.update({ where: { id: conv.id }, data: { unread: 0 } });
  return ok(await conversationDetail(conv, a.ctx.config));
}

const Patch = z.object({
  status: z.enum(["open", "done"]).optional(),
  assignee: z.string().max(120).optional(),
  recordId: z.string().nullable().optional(),
});

/** Đổi trạng thái (Đã xong / Mở lại), giao cho thành viên, gắn/bỏ gắn khách. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const { status, assignee, recordId } = p.data;
  const data: { status?: string; assignee?: string; recordId?: string | null; unread?: number } = {};
  if (status) {
    data.status = status;
    if (status === "done") data.unread = 0;
  }
  if (assignee !== undefined) {
    if (assignee && !a.ctx.config.team.includes(assignee) && assignee !== a.ctx.user.name) return fail("Người này không có trong đội ngũ");
    data.assignee = assignee;
  }
  if (recordId !== undefined) {
    if (recordId && !(await db.record.findFirst({ where: { AND: [{ id: recordId }, await recordScope(a.ctx)] }, select: { id: true } }))) return fail("Không tìm thấy khách", 404);
    data.recordId = recordId;
  }
  const next = await db.conversation.update({ where: { id: conv.id }, data });
  const parts = [status && (status === "done" ? "đánh dấu đã xong" : "mở lại"), assignee !== undefined && (assignee ? `giao cho ${assignee}` : "bỏ giao"), recordId !== undefined && (recordId ? "gắn khách" : "bỏ gắn khách")].filter(Boolean);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "conversation", conv.id, `Hội thoại ${conv.name}: ${parts.join(", ")}`);
  return ok({ ok: true, status: next.status, assignee: next.assignee, recordId: next.recordId });
}
