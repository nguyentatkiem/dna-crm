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

/** Job định kỳ: nhắc việc sắp đến hạn / quá hạn. Phần này do module Thông báo hoàn thiện. */
export async function tickReminders(): Promise<void> {}
