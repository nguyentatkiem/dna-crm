// Việc chạy nền của Chăm sóc. Đăng ký trong src/lib/jobs.ts.
import { db } from "../db";
import { notify, notifyOnce, userIdByName } from "../notify";
import { membersWith } from "../permissions";
import { EXPIRING_DAYS } from "./shared";

/** Phiếu quá hạn SLA mà chưa xử lý: đánh dấu leo thang (một lần) và báo người phụ trách + quản lý. */
export async function tickTickets(now = new Date()): Promise<number> {
  const due = await db.ticket.findMany({ where: { status: { in: ["open", "pending"] }, dueAt: { lt: now }, escalatedAt: null }, take: 500 });
  for (const t of due) {
    // updateMany có điều kiện escalatedAt: null để hai lượt chạy chồng nhau không báo hai lần.
    const r = await db.ticket.updateMany({ where: { id: t.id, escalatedAt: null }, data: { escalatedAt: now } });
    if (!r.count) continue;
    const text = `Phiếu ${t.number} “${t.subject}” đã quá hạn SLA${t.assignee ? ` (${t.assignee})` : ""}`;
    const href = `/w/tickets/${t.id}`;
    const ids = new Set<string>();
    const assigneeId = await userIdByName(t.workspaceId, t.assignee);
    if (assigneeId) ids.add(assigneeId);
    // Người được xem mọi phiếu (chủ, quản lý, vai trò có quyền "Xem mọi phiếu hỗ trợ").
    for (const userId of await membersWith(t.workspaceId, "ticket_view_all")) ids.add(userId);
    for (const userId of ids) await notify(t.workspaceId, { userId, kind: "ticket", text, href });
  }
  return due.length;
}

/** Nhắc phiếu bảo hành sắp hết hạn (trước 30 ngày, một lần) và chuyển phiếu quá hạn sang "Hết hạn". */
export async function tickWarranties(now = new Date()): Promise<{ reminded: number; expired: number }> {
  const expired = await db.warranty.updateMany({ where: { status: "active", endAt: { lt: now } }, data: { status: "expired" } });
  const soon = await db.warranty.findMany({ where: { status: "active", remindedAt: null, endAt: { gte: now, lte: new Date(now.getTime() + EXPIRING_DAYS * 864e5) } }, take: 500 });
  let reminded = 0;
  for (const w of soon) {
    const owner = w.recordId ? (await db.record.findFirst({ where: { id: w.recordId }, select: { ownerName: true } }))?.ownerName ?? "" : "";
    const userId = await userIdByName(w.workspaceId, owner);
    const d = w.endAt.toLocaleDateString("vi-VN", { timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" });
    await notifyOnce(w.workspaceId, { userId, kind: "warranty", text: `Bảo hành ${w.productName} của ${w.customerName || w.phone || "khách"} hết hạn ngày ${d}`, href: `/w/warranty?id=${w.id}` });
    await db.warranty.update({ where: { id: w.id }, data: { remindedAt: now } });
    reminded++;
  }
  return { reminded, expired: expired.count };
}
