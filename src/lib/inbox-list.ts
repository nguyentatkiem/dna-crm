// Hộp thư phía server: danh sách theo bộ lọc nâng cao, chi tiết hội thoại, thẻ & chủ đề (Pref).
// Mọi chỗ liệt kê / mở hội thoại đi qua conversationWhere(ctx) (quyền + chế độ chia hội thoại).
import type { Conversation, Prisma } from "@prisma/client";
import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { conversationWhere } from "./chat/visibility";
import { buildInboxWhere, inboxOrderBy, unrepliedWhere, type InboxQuery } from "./inbox-query";
import { cleanTopics, parseTags, type InboxTag, type Topic } from "./quick-replies";
import type { InboxAttachment, InboxDetail, InboxItem, InboxList, InboxMessage, InboxPage, InboxRecord } from "./inbox-types";

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/* ───────────── Pref dạng mảng (getPref gộp object nên không dùng cho mảng) ───────────── */

async function prefArray(workspaceId: string, key: string): Promise<unknown[]> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
  const v = parseJson<unknown>(row?.valueJson, []);
  if (Array.isArray(v)) return v;
  // Phòng khi ai đó lưu dạng { items: [...] }.
  return v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items) ? (v as { items: unknown[] }).items : [];
}
async function savePrefArray(workspaceId: string, key: string, value: unknown[]) {
  const valueJson = JSON.stringify(value);
  await db.pref.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, valueJson }, update: { valueJson } });
}

export const DEFAULT_TAGS: InboxTag[] = [
  { key: "hoi-gia", name: "Hỏi giá", color: "blue" },
  { key: "chot-don", name: "Chốt đơn", color: "green" },
  { key: "khach-vip", name: "Khách VIP", color: "purple" },
  { key: "khieu-nai", name: "Khiếu nại", color: "red" },
  { key: "spam", name: "Spam", color: "gray" },
];
export const DEFAULT_TOPICS: Topic[] = [
  { key: "chao-hoi", name: "Chào hỏi", color: "blue" },
  { key: "bao-gia", name: "Báo giá", color: "green" },
  { key: "chot-don", name: "Chốt đơn", color: "orange" },
  { key: "cham-soc", name: "Chăm sóc", color: "purple" },
];

/** Thẻ hội thoại (Pref "inboxTags"). Chưa cấu hình thì dùng bộ mặc định. */
export async function getInboxTags(workspaceId: string): Promise<InboxTag[]> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: "inboxTags" } }, select: { workspaceId: true } });
  return row ? cleanTopics(await prefArray(workspaceId, "inboxTags")) : DEFAULT_TAGS;
}
export const setInboxTags = (workspaceId: string, tags: InboxTag[]) => savePrefArray(workspaceId, "inboxTags", cleanTopics(tags));

/** Chủ đề mẫu trả lời nhanh (Pref "quickReplyTopics"). */
export async function getQuickTopics(workspaceId: string): Promise<Topic[]> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: "quickReplyTopics" } }, select: { workspaceId: true } });
  return row ? cleanTopics(await prefArray(workspaceId, "quickReplyTopics")) : DEFAULT_TOPICS;
}
export const setQuickTopics = (workspaceId: string, topics: Topic[]) => savePrefArray(workspaceId, "quickReplyTopics", cleanTopics(topics));

/* ───────────── Trang ───────────── */

/** Danh sách trang/kênh (không bao giờ trả token). */
export async function listPages(workspaceId: string): Promise<InboxPage[]> {
  const rows = await db.fbPage.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { pageId: true, name: true, avatar: true, platform: true, active: true } });
  return rows.map((r) => ({ ...r, name: r.name || `Trang ${r.pageId}` }));
}

/* ───────────── Tìm hội thoại trong phạm vi ───────────── */

export async function findVisibleConversation(ctx: Ctx, id: string) {
  return db.conversation.findFirst({ where: { AND: [{ id }, await conversationWhere(ctx)] } });
}

/* ───────────── DTO ───────────── */

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const splitPhones = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function toItem(c: Conversation, titles: Map<string, string>, pages: Map<string, string>): InboxItem {
  return {
    id: c.id,
    channel: c.channel,
    kind: c.kind === "comment" ? "comment" : "inbox",
    pageId: c.pageId,
    pageName: (c.pageId && pages.get(c.pageId)) || "",
    postId: c.postId,
    name: c.name || "Khách",
    avatar: c.avatar,
    lastText: c.lastText,
    lastAt: c.lastAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    unread: c.unread,
    assignee: c.assignee,
    status: c.status,
    recordId: c.recordId,
    recordTitle: (c.recordId && titles.get(c.recordId)) || "",
    tags: parseTags(c.tagsJson),
    phones: splitPhones(c.phones),
    lastInAt: iso(c.lastInAt),
    lastOutAt: iso(c.lastOutAt),
    readAt: iso(c.readAt),
    orderMarked: c.orderMarked,
    privateReplied: c.privateReplied,
    source: c.source,
    sourceRef: c.sourceRef,
    sentiment: c.sentiment,
  };
}

async function titlesOf(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await db.record.findMany({ where: { id: { in: list } }, select: { id: true, title: true } });
  return new Map(rows.map((r) => [r.id, r.title]));
}
async function pageNames(workspaceId: string) {
  const rows = await db.fbPage.findMany({ where: { workspaceId }, select: { pageId: true, name: true } });
  return new Map(rows.map((r) => [r.pageId, r.name || r.pageId]));
}

/* ───────────── Danh sách ───────────── */

export async function listInbox(ctx: Ctx, q: InboxQuery): Promise<InboxList> {
  const wid = ctx.workspace.id;
  const scope = await conversationWhere(ctx);
  const fields = db.conversation.fields;
  const livePostIds = q.live ? (await db.fbPost.findMany({ where: { workspaceId: wid, live: true }, select: { postId: true } })).map((p) => p.postId) : [];
  const where: Prisma.ConversationWhereInput = { AND: [scope, ...buildInboxWhere(q, { fields, livePostIds })] };
  const rows = await db.conversation.findMany({ where, orderBy: inboxOrderBy(q), take: q.limit + 1 });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);

  // Số đếm cho tab và bộ lọc nhanh: theo trang đang chọn, chỉ hội thoại đang mở.
  const base: Prisma.ConversationWhereInput[] = [scope, { status: { not: "done" } }, ...(q.page ? [{ pageId: q.page }] : [])];
  const count = (extra: Prisma.ConversationWhereInput[]) => db.conversation.count({ where: { AND: [...base, ...extra] } });
  const [all, inbox, comment, unread, unreplied, unreadSum, titles, pages] = await Promise.all([
    count([]),
    count([{ kind: { not: "comment" } }]),
    count([{ kind: "comment" }]),
    count([{ unread: { gt: 0 } }]),
    count([unrepliedWhere(fields)]),
    db.conversation.aggregate({ where: scope, _sum: { unread: true } }),
    titlesOf(page.map((r) => r.recordId)),
    pageNames(wid),
  ]);
  return { items: page.map((r) => toItem(r, titles, pages)), counts: { all, inbox, comment, unread, unreplied }, unreadTotal: unreadSum._sum.unread ?? 0, hasMore };
}

/* ───────────── Chi tiết ───────────── */

export function recordCard(rec: { id: string; title: string; dataJson: string; score: number; status: string; ownerName: string; objectKey: string }, cfg: WorkspaceConfig): InboxRecord {
  const obj = getObject(cfg, rec.objectKey);
  const d = parseJson<Record<string, string | number>>(rec.dataJson, {});
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key ?? "";
  const emailKey = obj?.fields.find((f) => f.type === "email")?.key ?? "";
  // Bảng khách không có ô địa chỉ: địa chỉ phát hiện trong chat được lưu ở "_dia_chi" (xem saveAddress trong src/lib/inbox.ts).
  const addressKey = obj?.fields.find((f) => /dia_chi|address/.test(f.key) || /địa chỉ/i.test(f.label))?.key ?? "_dia_chi";
  const st = obj?.statuses.find((s) => s.key === rec.status);
  return {
    id: rec.id,
    title: rec.title,
    phone: phoneKey ? String(d[phoneKey] ?? "") : "",
    phoneKey,
    email: emailKey ? String(d[emailKey] ?? "") : "",
    emailKey,
    address: addressKey ? String(d[addressKey] ?? "") : "",
    addressKey,
    score: rec.score,
    status: rec.status,
    statusLabel: st?.label ?? rec.status,
    statusColor: st?.color ?? "gray",
    source: String(d._nguon || d.nguon || ""),
    owner: rec.ownerName,
  };
}

export async function inboxDetail(conv: Conversation, cfg: WorkspaceConfig): Promise<InboxDetail> {
  const [msgs, rec, post, titles, pages] = await Promise.all([
    db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 300 }),
    conv.recordId ? db.record.findFirst({ where: { id: conv.recordId, deletedAt: null }, include: { activities: { orderBy: { createdAt: "desc" }, take: 5 } } }) : null,
    conv.postId ? db.fbPost.findFirst({ where: { workspaceId: conv.workspaceId, postId: conv.postId } }) : null,
    titlesOf([conv.recordId]),
    pageNames(conv.workspaceId),
  ]);
  return {
    conversation: toItem(conv, titles, pages),
    messages: msgs.reverse().map<InboxMessage>((m) => ({
      id: m.id,
      direction: m.direction as InboxMessage["direction"],
      kind: m.kind,
      text: m.text,
      attachments: parseJson<InboxAttachment[]>(m.attachmentsJson, []),
      author: m.author,
      status: m.status,
      error: m.error,
      at: m.createdAt.toISOString(),
      commentId: m.commentId,
      parentId: m.parentId,
      hidden: m.hidden,
      liked: m.liked,
    })),
    post: post
      ? { postId: post.postId, pageId: post.pageId, message: post.message, image: post.image, permalink: post.permalink, kind: post.kind, live: post.live, postedAt: post.postedAt.toISOString(), commentsCount: post.commentsCount }
      : null,
    record: rec ? recordCard(rec, cfg) : null,
    activities: (rec?.activities ?? []).map((a) => ({ id: a.id, kind: a.kind, body: a.body, author: a.author, at: a.createdAt.toISOString() })),
  };
}
