// Truy cập trực tiếp database E2E (e2e/.data/e2e.db) để tạo dữ liệu riêng cho từng bài kiểm thử
// (người dùng dùng một lần, thành viên mới...). Dùng Prisma client của bản sao app để khớp schema.
import { createRequire } from "node:module";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient as PC } from "@prisma/client";
import { APP_DIR, DATABASE_URL, USERS } from "../env";

let client: PC | undefined;
export function db(): PC {
  if (!client) {
    const req = createRequire(path.join(APP_DIR, "package.json"));
    const { PrismaClient } = req("@prisma/client") as { PrismaClient: new (o: object) => PC };
    client = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  }
  return client;
}

export const uid = (prefix = "e2e") => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function workspaceId() {
  const m = await db().membership.findFirstOrThrow({ where: { user: { email: USERS.owner.email } } });
  return m.workspaceId;
}

/** Tạo người dùng dùng một lần trong workspace demo. welcomeSeen=false để thấy lời chào. */
export async function createUser(o: { role?: string; name?: string; welcomeSeen?: boolean } = {}) {
  const id = uid("u");
  const email = `${id}@e2e.local`;
  const password = "pass-" + id;
  const name = o.name ?? `Người thử ${id.slice(-5)}`;
  const wid = await workspaceId();
  const user = await db().user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 4) } });
  await db().membership.create({ data: { userId: user.id, workspaceId: wid, role: o.role ?? "member" } });
  if (o.welcomeSeen !== false) {
    await db().pref.create({ data: { workspaceId: wid, key: `tutorial:${user.id}`, valueJson: JSON.stringify({ welcomeSeen: true, checklistHidden: true }) } });
  }
  return { id: user.id, email, password, name, workspaceId: wid };
}

/**
 * Hội thoại Messenger mới (chưa gắn hồ sơ) với một tin khách gửi tới, trên trang Facebook demo đã kết nối
 * (token demo_ → gửi chạy thử). kind "comment": bình luận trên bài viết của trang demo.
 * pageId "mau-page": như hội thoại mẫu của seedInbox (trang chưa kết nối).
 */
export async function createConversation(o: { name: string; text: string; kind?: "inbox" | "comment"; phone?: string; replied?: boolean; pageId?: string }) {
  const wid = await workspaceId();
  const ext = uid("conv");
  const now = new Date();
  const comment = o.kind === "comment";
  // Bài viết mẫu của trang demo (seedFanpage): bình luận ẩn/hiện được ở chế độ chạy thử.
  const post = comment ? await db().conversation.findFirst({ where: { workspaceId: wid, kind: "comment", postId: { not: "" } }, select: { pageId: true, postId: true } }) : null;
  return db().conversation.create({
    data: {
      workspaceId: wid,
      channel: "messenger",
      externalId: comment ? `c:${post!.postId}:${ext}` : ext,
      pageId: post?.pageId ?? o.pageId ?? (await db().fbPage.findFirstOrThrow({ where: { workspaceId: wid, platform: "facebook" }, orderBy: { createdAt: "asc" } })).pageId,
      postId: post?.postId ?? "",
      name: o.name,
      lastText: o.text,
      lastAt: now,
      lastInAt: now,
      unread: o.replied ? 0 : 1,
      lastOutAt: o.replied ? new Date(now.getTime() + 1000) : null,
      firstReplyAt: o.replied ? new Date(now.getTime() + 1000) : null,
      kind: comment ? "comment" : "inbox",
      phones: o.phone ?? "",
      messages: { create: [{ direction: "in", text: o.text, author: o.name, externalId: ext, kind: comment ? "comment" : "message", commentId: comment ? ext : "" }, ...(o.replied ? [{ direction: "out", text: "Dạ em chào anh/chị", author: "Chủ Demo", externalId: `${ext}-1`, createdAt: new Date(now.getTime() + 1000) }] : [])] },
    },
  });
}
