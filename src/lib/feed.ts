import type { Post, PostComment } from "@prisma/client";
import { db, parseJson } from "./db";

export const REACTIONS = ["👍", "❤️", "🎉", "👏", "😂"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const KINDS = ["post", "announcement", "win"] as const;
export type PostKind = (typeof KINDS)[number];
export const KIND_LABEL: Record<PostKind, string> = { post: "Bài viết", announcement: "Thông báo", win: "Chốt đơn" };
export const DEFAULT_CHANNEL = "chung";

export type Reactions = Partial<Record<Reaction, string[]>>;

/** Bật/tắt một cảm xúc của một người (thuần, có kiểm thử). Bỏ khoá rỗng. */
export function toggleReaction(r: Reactions, emoji: Reaction, who: string): Reactions {
  const cur = r[emoji] ?? [];
  const next = cur.includes(who) ? cur.filter((x) => x !== who) : [...cur, who];
  const out: Reactions = { ...r };
  if (next.length) out[emoji] = next;
  else delete out[emoji];
  return out;
}

export const parseReactions = (s: string): Reactions => {
  const r = parseJson<Record<string, unknown>>(s, {});
  const out: Reactions = {};
  for (const e of REACTIONS) if (Array.isArray(r[e])) out[e] = (r[e] as unknown[]).map(String);
  return out;
};

/** Chuẩn hoá tên kênh: chữ thường, gọn khoảng trắng, tối đa 30 ký tự. Rỗng thì về "chung". */
export function normChannel(s: string | null | undefined) {
  const c = String(s ?? "").trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 30);
  return c || DEFAULT_CHANNEL;
}

/** Ai được xoá bài/bình luận: tác giả, hoặc chủ/quản lý. */
export const canDeletePost = (author: string, me: string, manager: boolean) => manager || author === me;

/** Sắp bài: ghim lên đầu, sau đó mới nhất trước. */
export function sortPosts<T extends { pinned: boolean; createdAt: Date | string }>(posts: T[]) {
  return [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export type PostDTO = {
  id: string;
  author: string;
  body: string;
  kind: PostKind;
  channel: string;
  pinned: boolean;
  reactions: Reactions;
  createdAt: string;
  comments: { id: string; author: string; body: string; createdAt: string }[];
};

export function postDTO(p: Post & { comments?: PostComment[] }): PostDTO {
  return {
    id: p.id,
    author: p.author,
    body: p.body,
    kind: (KINDS as readonly string[]).includes(p.kind) ? (p.kind as PostKind) : "post",
    channel: p.channel,
    pinned: p.pinned,
    reactions: parseReactions(p.reactionsJson),
    createdAt: p.createdAt.toISOString(),
    comments: (p.comments ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((c) => ({ id: c.id, author: c.author, body: c.body, createdAt: c.createdAt.toISOString() })),
  };
}

/** Danh sách bài (kèm bình luận), lọc theo kênh nếu có. */
export async function listPosts(workspaceId: string, channel?: string, take = 50) {
  const rows = await db.post.findMany({
    where: { workspaceId, ...(channel ? { channel } : {}) },
    include: { comments: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map(postDTO);
}

/** Các kênh đang có bài, "chung" luôn đứng đầu. */
export async function listChannels(workspaceId: string) {
  const rows = await db.post.groupBy({ by: ["channel"], where: { workspaceId }, _count: true });
  const names = rows.map((r) => r.channel).filter((c) => c !== DEFAULT_CHANNEL).sort((a, b) => a.localeCompare(b, "vi"));
  return [DEFAULT_CHANNEL, ...names];
}

/**
 * Đăng bài "chốt đơn" lên bảng tin (gọi khi giao dịch thắng, đơn hoàn tất).
 * Không bao giờ làm hỏng luồng chính: lỗi chỉ ghi log.
 */
export async function postWin(workspaceId: string, text: string, author = "Hệ thống") {
  try {
    const body = text.trim().slice(0, 2000);
    if (!body) return null;
    return await db.post.create({ data: { workspaceId, author, body, kind: "win", channel: DEFAULT_CHANNEL } });
  } catch (e) {
    console.error("[feed]", e instanceof Error ? e.message : e);
    return null;
  }
}
