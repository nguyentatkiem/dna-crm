// Bộ lọc nâng cao cho danh sách hội thoại (Hộp thư). Thuần: dùng được cả client (dựng URL) lẫn server (dựng where Prisma).
// Không import db ở đây để kiểm thử được mà không cần database.
import type { Prisma } from "@prisma/client";

export type ReadFilter = "" | "unread" | "unreplied" | "read_unreplied";
export type InboxSort = "newest" | "oldest_wait";

export type InboxQuery = {
  /** "" = Tất cả, "inbox" = Tin nhắn, "comment" = Bình luận. */
  kind: "" | "inbox" | "comment";
  /** pageId của một trang; "" = gộp mọi trang. */
  page: string;
  channel: string;
  status: "open" | "done" | "all";
  read: ReadFilter;
  sort: InboxSort;
  phone: "" | "has" | "none";
  tags: string[];
  tagMode: "any" | "all";
  notTags: string[];
  /** Tên người phụ trách; chuỗi rỗng trong mảng = "chưa giao". */
  assignees: string[];
  source: "" | "post" | "ad" | "website" | "ref";
  /** postId cụ thể (deep link ?post=), hoặc nhiều bài gộp "a,b". */
  post: string;
  dateField: "created" | "updated";
  from: string;
  to: string;
  /** Bình luận: "no" = chưa nhắn riêng, "yes" = đã nhắn riêng. */
  privateReplied: "" | "no" | "yes";
  orderMarked: boolean;
  live: "" | "live" | "notlive";
  q: string;
  limit: number;
};

export const DEFAULT_QUERY: InboxQuery = {
  kind: "",
  page: "",
  channel: "",
  status: "open",
  read: "",
  sort: "newest",
  phone: "",
  tags: [],
  tagMode: "any",
  notTags: [],
  assignees: [],
  source: "",
  post: "",
  dateField: "updated",
  from: "",
  to: "",
  privateReplied: "",
  orderMarked: false,
  live: "",
  q: "",
  limit: 100,
};

export const MAX_LIMIT = 500;

const pick = <T extends string>(v: string | null, allowed: readonly T[], fb: T): T => (v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
const list = (v: string | null) => (v ?? "").split(",").map((s) => s.trim()).filter((s, i, a) => !!s && a.indexOf(s) === i).slice(0, 30);
const ymd = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Đọc bộ lọc từ query string. Nhận cả tham số cũ ?filter=unread|mine|done (cần `me` cho "mine"). */
export function parseInboxQuery(sp: URLSearchParams, me = ""): InboxQuery {
  const q: InboxQuery = {
    kind: pick(sp.get("kind"), ["", "inbox", "comment"] as const, ""),
    page: (sp.get("page") ?? "").slice(0, 100),
    channel: (sp.get("channel") ?? "").slice(0, 40),
    status: pick(sp.get("status"), ["open", "done", "all"] as const, "open"),
    read: pick(sp.get("read"), ["", "unread", "unreplied", "read_unreplied"] as const, ""),
    sort: pick(sp.get("sort"), ["newest", "oldest_wait"] as const, "newest"),
    phone: pick(sp.get("phone"), ["", "has", "none"] as const, ""),
    tags: list(sp.get("tags")),
    tagMode: pick(sp.get("tagMode"), ["any", "all"] as const, "any"),
    notTags: list(sp.get("notTags")),
    // "chưa giao" mã hoá là "-" trên URL.
    assignees: list(sp.get("assignees")).map((a) => (a === "-" ? "" : a)),
    source: pick(sp.get("source"), ["", "post", "ad", "website", "ref"] as const, ""),
    post: (sp.get("post") ?? "").slice(0, 600),
    dateField: pick(sp.get("dateField"), ["created", "updated"] as const, "updated"),
    from: ymd(sp.get("from")),
    to: ymd(sp.get("to")),
    privateReplied: pick(sp.get("privateReplied"), ["", "no", "yes"] as const, ""),
    orderMarked: sp.get("orderMarked") === "1",
    live: pick(sp.get("live"), ["", "live", "notlive"] as const, ""),
    q: (sp.get("q") ?? "").trim().slice(0, 120),
    limit: Math.min(MAX_LIMIT, Math.max(20, Number(sp.get("limit")) || DEFAULT_QUERY.limit)),
  };
  const legacy = sp.get("filter");
  if (legacy === "unread") q.read = "unread";
  if (legacy === "done") q.status = "done";
  if (legacy === "mine" && me) q.assignees = [me];
  return q;
}

/** Bộ lọc → query string (chỉ ghi giá trị khác mặc định). */
export function toSearchParams(q: Partial<InboxQuery>): URLSearchParams {
  const full = { ...DEFAULT_QUERY, ...q };
  const u = new URLSearchParams();
  for (const k of Object.keys(DEFAULT_QUERY) as (keyof InboxQuery)[]) {
    const v = full[k];
    const d = DEFAULT_QUERY[k];
    if (Array.isArray(v)) {
      if (v.length) u.set(k, (k === "assignees" ? v.map((a) => a || "-") : v).join(","));
    } else if (typeof v === "boolean") {
      if (v) u.set(k, "1");
    } else if (v !== d && v !== "") u.set(k, String(v));
    else if (k === "status" && v !== d) u.set(k, String(v));
  }
  return u;
}

/** Số bộ lọc nâng cao đang bật (để hiện trên nút "Lọc"). Không tính tab, trang, ô tìm. */
export function activeFilterCount(q: InboxQuery): number {
  let n = 0;
  if (q.read) n++;
  if (q.phone) n++;
  if (q.tags.length || q.notTags.length) n++;
  if (q.assignees.length) n++;
  if (q.source || q.post) n++;
  if (q.from || q.to) n++;
  if (q.privateReplied) n++;
  if (q.orderMarked) n++;
  if (q.live) n++;
  if (q.status !== "open") n++;
  if (q.channel) n++;
  if (q.sort !== "newest") n++;
  return n;
}

export type FieldRefs = {
  lastInAt: Prisma.FieldRef<"Conversation", "DateTime">;
  readAt: Prisma.FieldRef<"Conversation", "DateTime">;
};

type BuildOpts = { fields: FieldRefs; livePostIds?: string[] };

/** Đầu ngày / cuối ngày theo giờ Việt Nam. */
export const dayStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
export const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

/** Điều kiện "khách nhắn sau tin trả lời cuối của shop" (chưa trả lời). */
export function unrepliedWhere(fields: FieldRefs): Prisma.ConversationWhereInput {
  return { lastInAt: { not: null }, OR: [{ lastOutAt: null }, { lastOutAt: { lt: fields.lastInAt } }] };
}

/**
 * Dựng các điều kiện AND cho Prisma (chưa gồm phạm vi quyền — ghép với conversationWhere(ctx) ở server).
 * `fields` = db.conversation.fields (so sánh cột với cột, vd. readAt > lastInAt).
 */
export function buildInboxWhere(q: InboxQuery, opts: BuildOpts, include: { kind?: boolean; read?: boolean } = {}): Prisma.ConversationWhereInput[] {
  const and: Prisma.ConversationWhereInput[] = [];
  const { fields } = opts;
  if (include.kind !== false && q.kind) and.push({ kind: q.kind });
  if (q.page) and.push({ pageId: q.page });
  if (q.channel) and.push({ channel: q.channel });
  if (q.status !== "all") and.push(q.status === "done" ? { status: "done" } : { status: { not: "done" } });

  if (include.read !== false) {
    if (q.read === "unread") and.push({ unread: { gt: 0 } });
    else if (q.read === "unreplied") and.push(unrepliedWhere(fields));
    else if (q.read === "read_unreplied") and.push(unrepliedWhere(fields), { readAt: { gt: fields.lastInAt } });
  }

  if (q.phone === "has") and.push({ phones: { not: "" } });
  else if (q.phone === "none") and.push({ phones: "" });

  // tagsJson là mảng JSON chuỗi: tìm theo "key" có cả dấu nháy để không khớp nhầm một phần.
  const tagCond = (t: string): Prisma.ConversationWhereInput => ({ tagsJson: { contains: JSON.stringify(t) } });
  if (q.tags.length) and.push(q.tagMode === "all" ? { AND: q.tags.map(tagCond) } : { OR: q.tags.map(tagCond) });
  for (const t of q.notTags) and.push({ NOT: tagCond(t) });

  if (q.assignees.length) and.push({ assignee: { in: q.assignees } });

  if (q.post) {
    // Nhiều bài gộp (livestream): ?post=a,b
    const ids = q.post.split(",").map((x) => x.trim()).filter(Boolean);
    and.push(ids.length > 1 ? { postId: { in: ids } } : { postId: ids[0] ?? q.post });
  }
  if (q.source) and.push({ source: q.source });

  if (q.from || q.to) {
    const range: Prisma.DateTimeFilter = {};
    if (q.from) range.gte = dayStart(q.from);
    if (q.to) range.lte = dayEnd(q.to);
    and.push(q.dateField === "created" ? { createdAt: range } : { lastAt: range });
  }

  if (q.privateReplied === "no") and.push({ kind: "comment", privateReplied: false });
  else if (q.privateReplied === "yes") and.push({ kind: "comment", privateReplied: true });
  if (q.orderMarked) and.push({ orderMarked: true });
  if (q.live) {
    const ids = opts.livePostIds ?? [];
    and.push(q.live === "live" ? { kind: "comment", postId: { in: ids } } : { kind: "comment", postId: { notIn: ids } });
  }

  const s = q.q.trim();
  if (s) {
    const digits = s.replace(/\D/g, "");
    // SQLite chỉ so không phân biệt hoa/thường với chữ ASCII: "đỗ" không khớp "Đỗ". Thử thêm các dạng viết hoa thường gặp.
    const or: Prisma.ConversationWhereInput[] = caseVariants(s).flatMap((v) => [{ name: { contains: v } }, { lastText: { contains: v } }, { messages: { some: { text: { contains: v } } } }]);
    if (digits.length >= 4) {
      // 0912 345 678 / +84912345678 đều khớp theo 9 số cuối.
      const tail = digits.slice(-9);
      or.push({ phones: { contains: tail } }, { messages: { some: { text: { contains: tail } } } });
    }
    and.push({ OR: or });
  }
  return and;
}

/** Các dạng hoa/thường của từ khoá: như gõ, thường, HOA, Viết Hoa Đầu Từ, Viết hoa chữ đầu. */
export function caseVariants(s: string): string[] {
  const lower = s.toLocaleLowerCase("vi");
  const cap = (w: string) => w.charAt(0).toLocaleUpperCase("vi") + w.slice(1);
  return [...new Set([s, lower, s.toLocaleUpperCase("vi"), lower.split(" ").map(cap).join(" "), cap(lower)])];
}

/** Thứ tự: mới nhất trước, hoặc "đợi lâu nhất" (tin khách cũ nhất chưa trả lời lên đầu). */
export function inboxOrderBy(q: InboxQuery): Prisma.ConversationOrderByWithRelationInput[] {
  if (q.sort === "oldest_wait") return [{ lastInAt: { sort: "asc", nulls: "last" } }, { lastAt: "asc" }];
  return [{ lastAt: "desc" }];
}

/** Hội thoại đang chờ shop trả lời (dùng cho đồng hồ chờ trên danh sách). */
export function isWaiting(c: { lastInAt: string | null; lastOutAt: string | null; status: string }) {
  if (c.status === "done" || !c.lastInAt) return false;
  return !c.lastOutAt || new Date(c.lastOutAt) < new Date(c.lastInAt);
}

/** Mức cảnh báo theo thời gian chờ: 0 = < 15 phút, 1 = < 1 giờ, 2 = < 4 giờ, 3 = lâu hơn. */
export function waitLevel(ms: number): 0 | 1 | 2 | 3 {
  const m = ms / 60000;
  return m < 15 ? 0 : m < 60 ? 1 : m < 240 ? 2 : 3;
}

/** "5 phút", "2 giờ", "3 ngày". */
export function waitLabel(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "vừa nhắn";
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}
