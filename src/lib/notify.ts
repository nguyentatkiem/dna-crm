import { db } from "./db";

export type NotifyInput = { userId?: string; kind: string; text: string; href?: string };

/** Tạo thông báo trong app. userId rỗng = mọi người trong workspace. */
export async function notify(workspaceId: string, n: NotifyInput) {
  try {
    await db.notification.create({ data: { workspaceId, userId: n.userId ?? "", kind: n.kind, text: n.text.slice(0, 300), href: n.href ?? "" } });
  } catch (e) {
    console.error("[notify]", e instanceof Error ? e.message : e);
  }
}

/** Tìm userId theo tên người phụ trách (ownerName lưu theo tên). */
export async function userIdByName(workspaceId: string, name: string) {
  if (!name) return "";
  const m = await db.membership.findFirst({ where: { workspaceId, user: { name } }, select: { userId: true } });
  return m?.userId ?? "";
}

const hhmm = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" });
const ddmm = (d: Date) => {
  const p = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" }).formatToParts(d);
  return `${p.find((x) => x.type === "day")?.value}/${p.find((x) => x.type === "month")?.value}`;
};

/** Tạo thông báo nếu trong 24 giờ qua chưa có thông báo cùng đường dẫn và nội dung. */
export async function notifyOnce(workspaceId: string, n: NotifyInput) {
  const text = n.text.slice(0, 300);
  const dup = await db.notification.findFirst({ where: { workspaceId, href: n.href ?? "", text, createdAt: { gte: new Date(Date.now() - 864e5) } }, select: { id: true } });
  if (dup) return false;
  await notify(workspaceId, { ...n, text });
  return true;
}

/**
 * Job định kỳ (5 phút): nhắc việc đến hạn trong 30 phút tới hoặc vừa quá hạn (trong 2 giờ),
 * và nhắc người gọi các cuộc hẹn gọi lại sắp tới. Mỗi việc chỉ nhắc một lần trong 24 giờ.
 */
export async function tickReminders(): Promise<void> {
  const now = Date.now();
  const from = new Date(now - 2 * 3600e3);
  const to = new Date(now + 30 * 60e3);

  const tasks = await db.task.findMany({ where: { done: false, dueAt: { gte: from, lte: to } }, take: 500 });
  const recIds = [...new Set(tasks.map((t) => t.recordId).filter((x): x is string => !!x))];
  const recs = recIds.length ? await db.record.findMany({ where: { id: { in: recIds } }, select: { id: true, title: true, ownerName: true, objectKey: true } }) : [];
  for (const t of tasks) {
    const rec = recs.find((r) => r.id === t.recordId);
    const who = t.assignee || rec?.ownerName || "";
    const userId = await userIdByName(t.workspaceId, who);
    const due = t.dueAt!;
    const text = `Việc “${t.title}”${rec ? ` (${rec.title})` : ""} đến hạn lúc ${hhmm(due)} ${ddmm(due)}`;
    await notifyOnce(t.workspaceId, { userId, kind: "task", text, href: `/w/my-work?task=${t.id}` });
  }

  const calls = await db.call.findMany({ where: { callbackAt: { gte: new Date(now - 15 * 60e3), lte: to } }, take: 500 });
  const callRecIds = [...new Set(calls.map((c) => c.recordId).filter((x): x is string => !!x))];
  const callRecs = callRecIds.length ? await db.record.findMany({ where: { id: { in: callRecIds } }, select: { id: true, title: true, objectKey: true } }) : [];
  for (const c of calls) {
    const rec = callRecs.find((r) => r.id === c.recordId);
    // Đã gọi lại rồi (có cuộc gọi mới hơn cho cùng khách) thì thôi nhắc.
    if (c.recordId && (await db.call.count({ where: { recordId: c.recordId, createdAt: { gt: c.createdAt } } }))) continue;
    const userId = await userIdByName(c.workspaceId, c.agentName);
    const at = c.callbackAt!;
    const text = `Hẹn gọi lại ${rec?.title ?? c.phone ?? "khách"} lúc ${hhmm(at)} ${ddmm(at)}`;
    await notifyOnce(c.workspaceId, { userId, kind: "call", text, href: rec ? `/w/b/${rec.objectKey}?open=${rec.id}` : "/w/telesales" });
  }
}
