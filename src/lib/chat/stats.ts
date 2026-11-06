// Thống kê hộp thư phía server: nạp dữ liệu gọn (vài truy vấn, không N+1) rồi tính bằng metrics.ts.
import type { Prisma } from "@prisma/client";
import { db, parseJson } from "../db";
import { accessOf, allow, visibleOwners } from "../permissions";
import { buildXlsx, type SheetSpec } from "../xlsx";
import { loadAssignPref, staffNames } from "./assign";
import { DAY_SHORT, fmtDuration } from "./hours";
import { computeInboxStats, hasPhone, resolveRange, RANGE_LABEL, type InboxStats, type RangePreset, type SConv, type SMsg } from "./metrics";
import { conversationWhere } from "./visibility";
import { getInboxTags } from "../inbox-list";

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

export type StatsQuery = { range?: string; from?: string | null; to?: string | null; page?: string; channel?: string; kind?: string };
export type TagInfo = { key: string; name: string; color: string };
export type StatsResponse = InboxStats & {
  preset: RangePreset;
  fromDay: string;
  toDay: string;
  /** false = chỉ thống kê của chính mình (không có quyền "Thống kê hộp thư"). */
  full: boolean;
  me: string;
  pages: { pageId: string; channel: string; name: string }[];
  channels: string[];
  tagInfo: TagInfo[];
  truncated: boolean;
};

const MAX_CONVS = 20000;
const MAX_MSGS = 150000;
const LOOKBACK_MS = 864e5; // nạp thêm 1 ngày trước khoảng để ghép phiên trả lời

export const CHANNEL_LABEL: Record<string, string> = { messenger: "Messenger", facebook: "Facebook", instagram: "Instagram", zalo: "Zalo" };

/** Danh mục thẻ như Hộp thư (Pref "inboxTags", chưa cấu hình thì bộ mặc định) — để thống kê hiện tên thẻ, không hiện mã. */
async function tagCatalog(workspaceId: string): Promise<TagInfo[]> {
  return (await getInboxTags(workspaceId)).map((t) => ({ key: t.key, name: t.name || t.key, color: t.color || "gray" }));
}

export async function inboxStats(ctx: Ctx, q: StatsQuery, now = Date.now()): Promise<StatsResponse> {
  const wid = ctx.workspace.id;
  const [acc, pref, scope, staff] = await Promise.all([accessOf(ctx), loadAssignPref(wid), conversationWhere(ctx), staffNames(wid)]);
  const full = allow(acc, "inbox_stats");
  const tz = pref.workingHours.tz;
  const r = resolveRange(q.range ?? "7d", q.from, q.to, now, tz);

  const and: Prisma.ConversationWhereInput[] = [scope];
  if (!full) and.push({ OR: [{ assignee: ctx.user.name }, { messages: { some: { direction: "out", author: ctx.user.name } } }] });
  if (q.page) and.push({ pageId: q.page });
  if (q.channel) and.push({ channel: q.channel });
  if (q.kind === "inbox" || q.kind === "comment") and.push({ kind: q.kind });
  const where: Prisma.ConversationWhereInput = { AND: [...and, { createdAt: { lt: new Date(r.to) }, lastAt: { gte: new Date(r.from - LOOKBACK_MS) } }] };

  const [convRows, pageRows, channelRows, tagInfo] = await Promise.all([
    db.conversation.findMany({
      where,
      take: MAX_CONVS,
      orderBy: { lastAt: "desc" },
      select: { id: true, pageId: true, channel: true, kind: true, assignee: true, tagsJson: true, createdAt: true, status: true, quality: true, lastInAt: true, lastOutAt: true, phones: true },
    }),
    db.fbPage.findMany({ where: { workspaceId: wid }, select: { pageId: true, name: true, platform: true } }),
    db.conversation.groupBy({ by: ["channel"], where: { workspaceId: wid } }),
    tagCatalog(wid),
  ]);
  const ids = convRows.map((c) => c.id);
  const msgRows = ids.length
    ? await db.message.findMany({
        where: { conversation: where, createdAt: { gte: new Date(r.from - LOOKBACK_MS), lt: new Date(r.to) }, direction: { in: ["in", "out"] } },
        orderBy: { createdAt: "asc" },
        take: MAX_MSGS,
        select: { conversationId: true, direction: true, kind: true, author: true, createdAt: true, text: true },
      })
    : [];

  // SĐT xuất hiện lần đầu: tin đến đầu tiên có SĐT; nếu hội thoại có SĐT từ trước khoảng nạp thì không tính là mới.
  const phoneConvs = new Set(convRows.filter((c) => c.phones).map((c) => c.id));
  const phoneFirstAt = new Map<string, number>();
  for (const m of msgRows) if (m.direction === "in" && phoneConvs.has(m.conversationId) && !phoneFirstAt.has(m.conversationId) && hasPhone(m.text)) phoneFirstAt.set(m.conversationId, m.createdAt.getTime());
  const older = convRows.filter((c) => phoneFirstAt.has(c.id) && c.createdAt.getTime() < r.from - LOOKBACK_MS).map((c) => c.id);
  if (older.length) {
    const prev = await db.message.findMany({ where: { conversationId: { in: older.slice(0, 5000) }, direction: "in", createdAt: { lt: new Date(r.from - LOOKBACK_MS) } }, select: { conversationId: true, text: true }, take: 50000 });
    for (const m of prev) if (hasPhone(m.text)) phoneFirstAt.set(m.conversationId, 0);
  }
  // Có SĐT nhưng không thấy trong tin đã nạp (vd. nhập tay) → vẫn tính "có SĐT", không tính "thu được mới".
  for (const id of phoneConvs) if (!phoneFirstAt.has(id)) phoneFirstAt.set(id, 0);

  const convs: SConv[] = convRows.map((c) => ({
    id: c.id,
    pageId: c.pageId,
    channel: c.channel,
    kind: c.kind,
    assignee: c.assignee,
    tags: parseJson<string[]>(c.tagsJson, []).filter((t) => typeof t === "string"),
    createdAt: c.createdAt.getTime(),
    status: c.status,
    quality: c.quality,
    lastInAt: c.lastInAt?.getTime() ?? null,
    lastOutAt: c.lastOutAt?.getTime() ?? null,
  }));
  const msgs: SMsg[] = msgRows.map((m) => ({ c: m.conversationId, d: m.direction, k: m.kind, a: m.author, t: m.createdAt.getTime() }));

  const owners = visibleOwners(acc);
  const stats = computeInboxStats({ convs, msgs, phoneFirstAt, from: r.from, to: r.to, wh: pref.workingHours, staffNames: full ? owners : [ctx.user.name], validStaff: [...new Set([...staff, ...convRows.map((c) => c.assignee).filter(Boolean)])] });
  const pages = pageRows.map((p) => ({ pageId: p.pageId, channel: p.platform === "instagram" ? "instagram" : "messenger", name: p.name || p.pageId }));
  return {
    ...stats,
    preset: r.preset,
    fromDay: r.fromDay,
    toDay: r.toDay,
    full,
    me: ctx.user.name,
    pages,
    channels: channelRows.map((c) => c.channel),
    tagInfo,
    truncated: convRows.length >= MAX_CONVS || msgRows.length >= MAX_MSGS,
  };
}

const pct = (x: number) => Math.round(x * 1000) / 10;
const minutes = (ms: number | null) => (ms == null ? null : Math.round(ms / 6000) / 10);

/** File Excel nhiều sheet: Tổng quan, Theo ngày, Theo trang, Theo nhân viên, Theo thẻ, Giờ cao điểm. */
export async function statsXlsx(s: StatsResponse): Promise<Buffer> {
  const pageName = new Map(s.pages.map((p) => [p.pageId, p.name]));
  const tagName = new Map(s.tagInfo.map((t) => [t.key, t.name]));
  const o = s.overview;
  const sheets: SheetSpec[] = [
    {
      name: "Tổng quan",
      columns: [{ header: "Chỉ số", kind: "text" }, { header: "Giá trị", kind: "text" }],
      rows: [
        ["Khoảng thời gian", `${s.fromDay} → ${s.toDay} (${RANGE_LABEL[s.preset]})`],
        ["Hội thoại mới", String(o.newConvs)],
        ["Hội thoại có hoạt động", String(o.activeConvs)],
        ["Tin nhắn đến", String(o.inMsgs)],
        ["Tin nhắn đi", String(o.outMsgs)],
        ["Bình luận", String(o.comments)],
        ["Bình luận đã trả lời", String(o.commentReplies)],
        ["SĐT thu được", String(o.phones)],
        ["Tỉ lệ có SĐT", `${pct(o.phoneRate)}%`],
        ["Đang chờ trả lời", String(o.unanswered)],
        ["Số phiên trả lời", String(o.sessions)],
        ["Phản hồi đầu tiên (trung vị, giờ làm việc)", fmtDuration(o.medianFirstResponseMs)],
        ["Phản hồi (trung vị mọi phiên)", fmtDuration(o.medianResponseMs)],
      ],
    },
    {
      name: "Theo ngày",
      columns: ["Ngày", "Hội thoại mới", "Tin đến", "Tin đi", "Bình luận", "SĐT"].map((h, i) => ({ header: h, kind: i ? "number" : "text" })),
      rows: s.daily.map((d) => [d.day, d.newConvs, d.inMsgs, d.outMsgs, d.comments, d.phones]),
    },
    {
      name: "Theo trang",
      columns: ["Trang / kênh", "Kênh", "Hội thoại mới", "Tin đến", "Tin đi", "Bình luận", "SĐT", "Phản hồi trung vị (phút)"].map((h, i) => ({ header: h, kind: i > 1 ? "number" : "text" })),
      rows: s.byPage.map((p) => [p.pageId ? (pageName.get(p.pageId) ?? p.pageId) : CHANNEL_LABEL[p.channel] ?? p.channel, CHANNEL_LABEL[p.channel] ?? p.channel, p.newConvs, p.inMsgs, p.outMsgs, p.comments, p.phones, minutes(p.medianResponseMs)]),
    },
    {
      name: "Theo nhân viên",
      columns: ["Nhân viên", "Tin đã gửi", "Bình luận đã trả lời", "Phiên trả lời", "Phản hồi TB (phút)", "Phản hồi trung vị (phút)", "SĐT mang về", "Hội thoại xử lý", "Điểm chất lượng TB"].map((h, i) => ({ header: h, kind: i ? "number" : "text" })),
      rows: s.byStaff.map((r) => [r.name, r.sent, r.commentReplies, r.sessions, minutes(r.avgResponseMs), minutes(r.medianResponseMs), r.phones, r.convs, r.quality]),
    },
    {
      name: "Theo thẻ",
      columns: [{ header: "Thẻ", kind: "text" }, { header: "Hội thoại", kind: "number" }, { header: "Mới trong khoảng", kind: "number" }],
      rows: s.tags.map((t) => [tagName.get(t.tag) ?? t.tag, t.count, t.newCount]),
    },
    {
      name: "Giờ cao điểm",
      columns: [{ header: "Thứ", kind: "text" }, ...Array.from({ length: 24 }, (_, h) => ({ header: `${h}h`, kind: "number" as const }))],
      rows: [1, 2, 3, 4, 5, 6, 0].map((d) => [DAY_SHORT[d], ...s.heatmap[d]]),
    },
  ];
  return buildXlsx(sheets);
}
