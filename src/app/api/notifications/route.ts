import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { taskScope } from "@/lib/permissions";

/**
 * Chuông thông báo. Gồm:
 * - Notification của người dùng hoặc thông báo chung (userId rỗng), chưa đọc lên trước;
 * - việc quá hạn / hạn hôm nay (luôn coi là chưa đọc cho tới khi xong việc);
 * - hoạt động mới của agent và tự động hoá (trạng thái đọc do trình duyệt nhớ).
 * Hạn chế: thông báo chung chỉ có một readAt, ai đánh dấu đọc thì mọi người cùng thấy đã đọc.
 */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const start = new Date(new Date().toDateString());
  const end = new Date(start.getTime() + 864e5);
  const mine = { workspaceId: wid, userId: { in: [a.ctx.user.id, ""] } };
  const [unread, read, tasks, logs] = await Promise.all([
    db.notification.findMany({ where: { ...mine, readAt: null }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notification.findMany({ where: { ...mine, readAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.task.findMany({ where: { AND: [await taskScope(a.ctx), { done: false, dueAt: { lt: end } }] }, orderBy: { dueAt: "asc" }, take: 15 }),
    db.agentLog.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return ok([
    ...[...unread, ...read].map((n) => ({ id: n.id, source: "notification", kind: n.kind, text: n.text, at: n.createdAt.toISOString(), href: n.href || "/w", read: !!n.readAt })),
    ...tasks.map((t) => ({ id: t.id, source: "task", kind: t.dueAt! < start ? "overdue" : "today", text: t.title, at: t.dueAt!.toISOString(), href: `/w/my-work?task=${t.id}`, read: false })),
    ...logs.map((l) => ({ id: l.id, source: "agent", kind: "agent", text: `${l.agent}: ${l.message}`, at: l.createdAt.toISOString(), href: "/w/agents", read: false })),
  ]);
}

/** Đánh dấu đã đọc. Body: { id } cho một thông báo, hoặc { all: true } cho tất cả. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  if (!body.id && !body.all) return fail("Thiếu thông báo cần đánh dấu");
  const where = { workspaceId: a.ctx.workspace.id, userId: { in: [a.ctx.user.id, ""] }, readAt: null, ...(body.all ? {} : { id: body.id }) };
  const { count } = await db.notification.updateMany({ where, data: { readAt: new Date() } });
  return ok({ marked: count });
}
