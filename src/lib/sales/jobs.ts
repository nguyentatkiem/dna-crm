// Job nền của Bán hàng. Đăng ký trong src/lib/jobs.ts (chủ module jobs làm).
import { db } from "@/lib/db";
import { notifyOnce, userIdByName } from "@/lib/notify";
import { managerIds } from "./access";
import { dmy, money } from "./shared";

/** Người cần biết: người tạo chứng từ + chủ/quản lý (bỏ trùng). */
async function audience(workspaceId: string, createdBy: string) {
  const ids = new Set(await managerIds(workspaceId));
  const creator = await userIdByName(workspaceId, createdBy);
  if (creator) ids.add(creator);
  return [...ids];
}

/**
 * Hợp đồng (60 phút): nhắc khi còn ≤ remindDays ngày tới endAt (mỗi hợp đồng một lần, ghi remindedAt),
 * và chuyển "Hết hạn" khi đã qua endAt.
 */
export async function tickContracts(now = new Date()): Promise<void> {
  const expired = await db.contract.findMany({ where: { status: "active", endAt: { lt: now } }, take: 500 });
  for (const c of expired) {
    await db.contract.update({ where: { id: c.id }, data: { status: "expired" } });
    for (const userId of await audience(c.workspaceId, c.createdBy)) {
      await notifyOnce(c.workspaceId, { userId, kind: "contract", text: `Hợp đồng ${c.number} “${c.title}” đã hết hạn ngày ${dmy(c.endAt)}`, href: `/w/contracts?open=${c.id}` });
    }
  }

  const soon = await db.contract.findMany({ where: { status: "active", remindedAt: null, endAt: { gte: now } }, take: 1000 });
  for (const c of soon) {
    const remindAt = c.endAt!.getTime() - c.remindDays * 864e5;
    if (remindAt > now.getTime()) continue;
    const days = Math.max(0, Math.ceil((c.endAt!.getTime() - now.getTime()) / 864e5));
    for (const userId of await audience(c.workspaceId, c.createdBy)) {
      await notifyOnce(c.workspaceId, { userId, kind: "contract", text: `Hợp đồng ${c.number} “${c.title}”${c.customerName ? ` (${c.customerName})` : ""} còn ${days} ngày hết hạn (${dmy(c.endAt)})`, href: `/w/contracts?open=${c.id}` });
    }
    await db.contract.update({ where: { id: c.id }, data: { remindedAt: now } });
  }
}

/** Công nợ (60 phút): đơn quá hạn thanh toán mà còn nợ → nhắc người tạo và quản lý (notifyOnce: tối đa 1 lần/ngày). */
export async function tickDebts(now = new Date()): Promise<void> {
  const orders = await db.order.findMany({ where: { status: { not: "cancelled" }, dueAt: { lt: now } }, take: 2000 });
  for (const o of orders) {
    const left = Math.round(o.total - o.paid);
    if (left <= 0) continue;
    for (const userId of await audience(o.workspaceId, o.createdBy)) {
      await notifyOnce(o.workspaceId, { userId, kind: "debt", text: `Đơn ${o.number} của ${o.customerName} quá hạn thanh toán ${dmy(o.dueAt)}, còn nợ ${money(left)}`, href: `/w/orders/${o.id}` });
    }
  }
}
