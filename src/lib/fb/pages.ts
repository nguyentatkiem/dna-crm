// Fanpage đã kết nối (FbPage), cài đặt trang / bài viết, chữ ký tin gửi đi.
import type { FbPage, FbPost } from "@prisma/client";
import { z } from "zod";
import { db, parseJson } from "../db";
import { getPref } from "../prefs";
import { getSettings } from "../settings";

/* ───────────── Cài đặt trang ───────────── */

export const PageSettings = z.object({
  autoHidePhone: z.boolean().default(false),
  autoHideAll: z.boolean().default(false),
  autoLike: z.boolean().default(false),
  autoMarkReadComments: z.boolean().default(false),
  signature: z.string().max(150).default(""),
});
export type PageSettings = z.infer<typeof PageSettings>;
export const PAGE_SETTINGS_DEFAULT: PageSettings = PageSettings.parse({});

export const pageSettings = (p: Pick<FbPage, "settingsJson"> | null | undefined): PageSettings => {
  const r = PageSettings.safeParse(parseJson(p?.settingsJson, {}));
  return r.success ? r.data : PAGE_SETTINGS_DEFAULT;
};

/* ───────────── Cài đặt bài viết ───────────── */

export const PostSettings = z.object({
  /** null = theo cài đặt trang. */
  autoHidePhone: z.boolean().nullable().default(null),
  autoHideAll: z.boolean().nullable().default(null),
  autoLike: z.boolean().nullable().default(null),
  /** Tự đánh dấu đã đọc bình luận của bài này (bài không cần chăm). */
  autoMarkRead: z.boolean().default(false),
  /** Bỏ qua: không tạo hội thoại bình luận cho bài này. */
  skip: z.boolean().default(false),
  /** Tự trả lời công khai bình luận đầu tiên của mỗi người. Biến {ten}. */
  replyComment: z.string().max(1000).default(""),
  /** Tự nhắn riêng cho người bình luận lần đầu. Biến {ten}. */
  replyInbox: z.string().max(1000).default(""),
  /** Chỉ tự trả lời khi bình luận có SĐT. */
  replyOnlyPhone: z.boolean().default(false),
  productIds: z.array(z.string()).default([]),
});
export type PostSettings = z.infer<typeof PostSettings>;
export const POST_SETTINGS_DEFAULT: PostSettings = PostSettings.parse({});

export const postSettings = (p: Pick<FbPost, "settingsJson"> | null | undefined): PostSettings => {
  const r = PostSettings.safeParse(parseJson(p?.settingsJson, {}));
  return r.success ? r.data : POST_SETTINGS_DEFAULT;
};

/** Cài đặt hiệu lực cho một bình luận: bài viết ghi đè trang. */
export function effectiveSettings(page: PageSettings, post: PostSettings) {
  return {
    autoHidePhone: post.autoHidePhone ?? page.autoHidePhone,
    autoHideAll: post.autoHideAll ?? page.autoHideAll,
    autoLike: post.autoLike ?? page.autoLike,
    autoMarkRead: post.autoMarkRead || page.autoMarkReadComments,
    skip: post.skip,
    replyComment: post.replyComment.trim(),
    replyInbox: post.replyInbox.trim(),
    replyOnlyPhone: post.replyOnlyPhone,
  };
}

/** Điền biến mẫu: {ten} = tên gọi (chữ cuối của họ tên), {ten_day_du} (hoặc {ho_ten}), {trang}. */
export function fillTemplate(tpl: string, vars: { name?: string; page?: string }) {
  const raw = (vars.name ?? "").trim();
  // Tên tạm ("Khách Messenger") không dùng để xưng hô.
  const full = /^Khách\b/.test(raw) ? "" : raw;
  const given = full.split(/\s+/).pop() ?? "";
  return (
    tpl
      .replace(/\{ten\}/g, given || "bạn")
      // {ten_day_du} như mẫu trả lời nhanh; {ho_ten} giữ cho mẫu cũ.
      .replace(/\{(ho_ten|ten_day_du)\}/g, full || "bạn")
      .replace(/\{trang\}/g, vars.page ?? "")
      // Dọn khoảng trắng thừa nhưng giữ xuống dòng của mẫu nhiều dòng.
      .split("\n")
      .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
      .join("\n")
      .trim()
  );
}

/* ───────────── Token ───────────── */

/** Pref "inboxCrm": tự tạo / cập nhật khách từ chat. */
export type InboxCrmPref = { autoCreateContact: boolean; autoUpdatePhone: boolean; autoAddress: boolean; signature: string };
export const INBOX_CRM_DEFAULT: InboxCrmPref = { autoCreateContact: true, autoUpdatePhone: true, autoAddress: true, signature: "" };
export const inboxCrmPref = (workspaceId: string) => getPref<InboxCrmPref>(workspaceId, "inboxCrm", INBOX_CRM_DEFAULT);

export async function findPage(workspaceId: string, pageId: string | null | undefined) {
  if (!pageId) return null;
  return db.fbPage.findUnique({ where: { workspaceId_pageId: { workspaceId, pageId } } });
}

/**
 * Token để gọi Graph cho một trang: token riêng của trang (FbPage) → token chung ở Nguồn khách → "".
 * Chỉ dùng phía server.
 */
export async function pageTokenFor(workspaceId: string, pageId?: string | null): Promise<{ token: string; page: FbPage | null }> {
  const page = await findPage(workspaceId, pageId);
  if (page?.token) return { token: page.token, page };
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } });
  return { token: (ws && getSettings(ws).facebook?.pageToken) || "", page };
}

/** Che token khi trả về trình duyệt. */
export const maskToken = (t: string) => (t ? `••••${t.slice(-4)}` : "");

/* ───────────── Chữ ký ───────────── */

/**
 * Thêm chữ ký của trang vào cuối tin gửi đi (cài ở Hộp thư → Trang, tối đa 150 ký tự;
 * không có thì dùng chữ ký chung Pref "inboxCrm".signature). Đã có chữ ký ở cuối thì không thêm lần nữa.
 * workspaceId nên truyền để không lẫn trang cùng mã ở workspace khác.
 */
export async function withSignature(pageId: string, text: string, workspaceId?: string): Promise<string> {
  const page = pageId ? await db.fbPage.findFirst({ where: { pageId, ...(workspaceId ? { workspaceId } : {}) } }) : null;
  let sig = pageSettings(page).signature.trim();
  if (!sig) {
    const wid = workspaceId ?? page?.workspaceId;
    if (wid) sig = (await inboxCrmPref(wid)).signature.trim().slice(0, 150);
  }
  return appendSignature(text, sig);
}

export function appendSignature(text: string, sig: string) {
  const t = text.replace(/\s+$/, "");
  if (!sig || !t || t.endsWith(sig)) return t;
  return `${t}\n${sig}`;
}
