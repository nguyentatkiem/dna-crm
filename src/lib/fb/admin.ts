// DTO và tiện ích phía server cho trang Trang / Bài viết / Link m.me. Không bao giờ trả token về trình duyệt.
import type { FbPage, FbPost } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { getPref, setPref } from "../prefs";
import { isDemoToken } from "./graph";
import { maskToken, pageSettings, postSettings, type PageSettings, type PostSettings } from "./pages";

export type PageDTO = {
  id: string;
  pageId: string;
  platform: string;
  name: string;
  avatar: string;
  active: boolean;
  hasToken: boolean;
  tokenMasked: string;
  demo: boolean;
  settings: PageSettings;
  createdAt: string;
};

export const pageDTO = (p: FbPage): PageDTO => ({
  id: p.id,
  pageId: p.pageId,
  platform: p.platform,
  name: p.name,
  avatar: p.avatar,
  active: p.active,
  hasToken: !!p.token,
  tokenMasked: maskToken(p.token),
  demo: isDemoToken(p.token),
  settings: pageSettings(p),
  createdAt: p.createdAt.toISOString(),
});

export type PostDTO = {
  id: string;
  pageId: string;
  pageName: string;
  postId: string;
  message: string;
  image: string;
  permalink: string;
  kind: string;
  live: boolean;
  postedAt: string;
  commentsCount: number;
  phonesCount: number;
  /** Số hội thoại bình luận (người bình luận) và số chưa đọc. */
  conversations: number;
  unread: number;
  topic: string;
  mergeKey: string;
  settings: PostSettings;
};

export const postDTO = (p: FbPost, extra: { pageName?: string; conversations?: number; unread?: number } = {}): PostDTO => ({
  id: p.id,
  pageId: p.pageId,
  pageName: extra.pageName ?? "",
  postId: p.postId,
  message: p.message,
  image: p.image,
  permalink: p.permalink,
  kind: p.kind,
  live: p.live,
  postedAt: p.postedAt.toISOString(),
  commentsCount: p.commentsCount,
  phonesCount: p.phonesCount,
  conversations: extra.conversations ?? 0,
  unread: extra.unread ?? 0,
  topic: p.topic,
  mergeKey: p.mergeKey,
  settings: postSettings(p),
});

/* ───────────── Link m.me có ref ───────────── */

export type MmeLink = { id: string; code: string; pageId: string; ref: string; label: string; clicks: number; createdAt: string; createdBy: string };
type MmePref = { links: MmeLink[] };
export const MME_PREF = "inboxMme";

export const mmeLinks = async (workspaceId: string) => (await getPref<MmePref>(workspaceId, MME_PREF, { links: [] })).links ?? [];
export const saveMmeLinks = (workspaceId: string, links: MmeLink[]) => setPref(workspaceId, MME_PREF, { links: links.slice(-500) });

export const newCode = () => randomBytes(5).toString("base64url");

/** Link gốc của Messenger: https://m.me/<page>?ref=<ref>. */
export const mmeUrl = (pageId: string, ref: string) => `https://m.me/${encodeURIComponent(pageId)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;

/** Chuẩn hoá ref: chữ, số, gạch dưới/gạch ngang, chấm (Messenger giới hạn 250 ký tự). */
export const cleanRef = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
