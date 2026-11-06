// Chỉ số thống kê hộp thư (thuần, có test). Server nạp dữ liệu một lần rồi gọi computeInboxStats.
import { businessMs, localParts, mean, median, type WorkingHours } from "./hours";

export type SConv = {
  id: string;
  pageId: string;
  channel: string;
  kind: string;
  assignee: string;
  tags: string[];
  createdAt: number;
  status: string;
  quality: number | null;
  lastInAt: number | null;
  lastOutAt: number | null;
};
/** d: in | out | note; k: message | comment; a: tác giả (nhân viên với tin đi). */
export type SMsg = { c: string; d: string; k: string; a: string; t: number };

export type Session = { conv: string; start: number; replyAt: number; author: string; ms: number; first: boolean };

const VN_PHONE = /(?:\+?84|\b0)(?:[\s.-]?\d){9}\b/;
/** Tin có chứa SĐT Việt Nam (10 số, có thể có dấu cách/chấm/gạch, +84). */
export const hasPhone = (s: string) => VN_PHONE.test(s);

/**
 * Phiên trả lời = một hoặc nhiều tin của khách, tiếp theo là tin trả lời của nhân viên.
 * ms = thời gian chờ tính trong giờ làm việc, từ tin đầu tiên của khách trong phiên đến tin trả lời đầu tiên.
 * msgs phải gồm tin của mọi hội thoại, sắp theo thời gian (mỗi hội thoại xét riêng).
 */
export function sessionsOf(msgs: SMsg[], wh: WorkingHours): Session[] {
  const pending = new Map<string, number>();
  const seen = new Set<string>();
  const out: Session[] = [];
  for (const m of msgs) {
    if (m.d === "in") {
      if (!pending.has(m.c)) pending.set(m.c, m.t);
    } else if (m.d === "out") {
      const start = pending.get(m.c);
      if (start != null) {
        out.push({ conv: m.c, start, replyAt: m.t, author: m.a, ms: businessMs(start, m.t, wh), first: !seen.has(m.c) });
        pending.delete(m.c);
        seen.add(m.c);
      }
    }
  }
  return out;
}

export type StaffRow = {
  name: string;
  sent: number;
  commentReplies: number;
  sessions: number;
  avgResponseMs: number | null;
  medianResponseMs: number | null;
  phones: number;
  convs: number;
  quality: number | null;
  qualityN: number;
};
export type PageRow = { key: string; pageId: string; channel: string; newConvs: number; inMsgs: number; outMsgs: number; comments: number; phones: number; medianResponseMs: number | null };
export type DayRow = { day: string; newConvs: number; inMsgs: number; outMsgs: number; comments: number; phones: number };
export type TagRow = { tag: string; count: number; newCount: number };

export type InboxStats = {
  from: string;
  to: string;
  overview: {
    newConvs: number;
    activeConvs: number;
    inMsgs: number;
    outMsgs: number;
    comments: number;
    commentReplies: number;
    phones: number;
    convWithPhone: number;
    phoneRate: number;
    unanswered: number;
    sessions: number;
    medianFirstResponseMs: number | null;
    avgFirstResponseMs: number | null;
    medianResponseMs: number | null;
  };
  daily: DayRow[];
  byPage: PageRow[];
  byStaff: StaffRow[];
  fastest: { name: string; medianResponseMs: number; sessions: number }[];
  tags: TagRow[];
  tagDaily: { day: string; counts: Record<string, number> }[];
  heatmap: number[][]; // [thứ 0–6][giờ 0–23] tin đến
};

export type StatsInput = {
  convs: SConv[];
  /** Tin nhắn sắp theo thời gian; có thể gồm một khoảng trước `from` để ghép phiên trả lời. */
  msgs: SMsg[];
  /** Thời điểm SĐT đầu tiên xuất hiện trong từng hội thoại (chỉ những hội thoại có SĐT). */
  phoneFirstAt: Map<string, number>;
  from: number;
  to: number;
  wh: WorkingHours;
  /** Chỉ giữ dòng nhân viên của những người này (null = tất cả). */
  staffNames?: string[] | null;
  /** Nhân viên hợp lệ (bỏ tác giả là bot / tên trang). Không truyền = mọi tác giả. */
  validStaff?: string[] | null;
};

export function dayKeys(from: number, to: number, tz: string): string[] {
  const out: string[] = [];
  const last = localParts(to - 1, tz).dayKey;
  let t = from;
  for (let i = 0; i < 400; i++) {
    const k = localParts(t, tz).dayKey;
    if (!out.includes(k)) out.push(k);
    if (k === last) break;
    t += 864e5;
  }
  return out;
}

export function computeInboxStats(inp: StatsInput): InboxStats {
  const { convs, msgs, from, to, wh } = inp;
  const tz = wh.tz;
  const inRange = (t: number) => t >= from && t < to;
  const day = (t: number) => localParts(t, tz).dayKey;
  const valid = inp.validStaff ? new Set(inp.validStaff) : null;
  const convMap = new Map(convs.map((c) => [c.id, c]));

  const days = dayKeys(from, to, tz);
  const daily = new Map<string, DayRow>(days.map((d) => [d, { day: d, newConvs: 0, inMsgs: 0, outMsgs: 0, comments: 0, phones: 0 }]));
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const pages = new Map<string, PageRow & { resp: number[] }>();
  const pageOf = (c: SConv) => {
    const key = `${c.channel}|${c.pageId}`;
    let p = pages.get(key);
    if (!p) pages.set(key, (p = { key, pageId: c.pageId, channel: c.channel, newConvs: 0, inMsgs: 0, outMsgs: 0, comments: 0, phones: 0, medianResponseMs: null, resp: [] }));
    return p;
  };
  type Acc = StaffRow & { resp: number[]; convSet: Set<string>; q: number[] };
  const staff = new Map<string, Acc>();
  const staffOf = (name: string): Acc | null => {
    if (!name || (valid && !valid.has(name))) return null;
    let s = staff.get(name);
    if (!s) staff.set(name, (s = { name, sent: 0, commentReplies: 0, sessions: 0, avgResponseMs: null, medianResponseMs: null, phones: 0, convs: 0, quality: null, qualityN: 0, resp: [], convSet: new Set(), q: [] }));
    return s;
  };

  const ov = { newConvs: 0, activeConvs: 0, inMsgs: 0, outMsgs: 0, comments: 0, commentReplies: 0, phones: 0, convWithPhone: 0, phoneRate: 0, unanswered: 0, sessions: 0, medianFirstResponseMs: null as number | null, avgFirstResponseMs: null as number | null, medianResponseMs: null as number | null };

  const active = new Set<string>();
  for (const m of msgs) {
    if (!inRange(m.t) || m.d === "note") continue;
    const c = convMap.get(m.c);
    if (!c) continue;
    active.add(m.c);
    const dr = daily.get(day(m.t));
    const p = pageOf(c);
    if (m.d === "in") {
      if (m.k === "comment") {
        ov.comments++;
        p.comments++;
        if (dr) dr.comments++;
      } else {
        ov.inMsgs++;
        p.inMsgs++;
        if (dr) dr.inMsgs++;
      }
      const lp = localParts(m.t, tz);
      heatmap[lp.day][lp.hour]++;
    } else if (m.d === "out") {
      if (m.k === "comment") ov.commentReplies++;
      else {
        ov.outMsgs++;
        if (dr) dr.outMsgs++;
      }
      p.outMsgs++;
      const s = staffOf(m.a);
      if (s) {
        if (m.k === "comment") s.commentReplies++;
        else s.sent++;
        s.convSet.add(m.c);
      }
    }
  }

  for (const c of convs) {
    if (inRange(c.createdAt)) {
      ov.newConvs++;
      pageOf(c).newConvs++;
      const dr = daily.get(day(c.createdAt));
      if (dr) dr.newConvs++;
      active.add(c.id);
    }
  }
  ov.activeConvs = active.size;

  // Phiên trả lời và thời gian phản hồi.
  const sessions = sessionsOf(msgs.filter((m) => convMap.has(m.c)), wh);
  const firstResp: number[] = [];
  const allResp: number[] = [];
  for (const s of sessions) {
    const c = convMap.get(s.conv)!;
    if (s.first && inRange(c.createdAt)) firstResp.push(s.ms);
    if (!inRange(s.replyAt)) continue;
    ov.sessions++;
    allResp.push(s.ms);
    pageOf(c).resp.push(s.ms);
    const st = staffOf(s.author);
    if (st) {
      st.sessions++;
      st.resp.push(s.ms);
    }
  }
  ov.medianFirstResponseMs = median(firstResp);
  ov.avgFirstResponseMs = mean(firstResp);
  ov.medianResponseMs = median(allResp);

  // SĐT thu được (lần đầu xuất hiện trong khoảng) → ghi công người phụ trách.
  for (const [id, t] of inp.phoneFirstAt) {
    const c = convMap.get(id);
    if (!c) continue;
    if (active.has(id)) ov.convWithPhone++;
    if (!inRange(t)) continue;
    ov.phones++;
    pageOf(c).phones++;
    const dr = daily.get(day(t));
    if (dr) dr.phones++;
    const s = staffOf(c.assignee);
    if (s) s.phones++;
  }
  ov.phoneRate = ov.activeConvs ? ov.convWithPhone / ov.activeConvs : 0;

  // Chưa trả lời (hiện tại) + điểm chất lượng + hội thoại phụ trách.
  for (const c of convs) {
    if (!active.has(c.id)) continue;
    if (c.status !== "done" && c.lastInAt && (!c.lastOutAt || c.lastOutAt < c.lastInAt)) ov.unanswered++;
    const s = staffOf(c.assignee);
    if (s) {
      s.convSet.add(c.id);
      if (c.quality != null) s.q.push(c.quality);
    }
  }

  // Thẻ.
  const tagCount = new Map<string, TagRow>();
  for (const c of convs) {
    if (!active.has(c.id)) continue;
    for (const tag of c.tags) {
      const r = tagCount.get(tag) ?? { tag, count: 0, newCount: 0 };
      r.count++;
      if (inRange(c.createdAt)) r.newCount++;
      tagCount.set(tag, r);
    }
  }
  const tags = [...tagCount.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "vi"));
  const topTags = tags.slice(0, 6).map((t) => t.tag);
  const tagDaily = days.map((d) => ({ day: d, counts: Object.fromEntries(topTags.map((t) => [t, 0])) as Record<string, number> }));
  const tdIdx = new Map(tagDaily.map((r, i) => [r.day, i]));
  for (const c of convs) {
    if (!inRange(c.createdAt)) continue;
    const i = tdIdx.get(day(c.createdAt));
    if (i == null) continue;
    for (const t of c.tags) if (t in tagDaily[i].counts) tagDaily[i].counts[t]++;
  }

  const filter = inp.staffNames ? new Set(inp.staffNames) : null;
  const byStaff: StaffRow[] = [...staff.values()]
    .filter((s) => !filter || filter.has(s.name))
    .map(({ resp, convSet, q, ...s }) => ({ ...s, convs: convSet.size, avgResponseMs: mean(resp), medianResponseMs: median(resp), quality: q.length ? Math.round(mean(q)!) : null, qualityN: q.length }))
    .sort((a, b) => b.sessions - a.sessions || b.sent - a.sent || a.name.localeCompare(b.name, "vi"));
  const fastest = byStaff
    .filter((s) => s.medianResponseMs != null && s.sessions > 0)
    .sort((a, b) => a.medianResponseMs! - b.medianResponseMs! || b.sessions - a.sessions)
    .slice(0, 5)
    .map((s) => ({ name: s.name, medianResponseMs: s.medianResponseMs!, sessions: s.sessions }));

  const byPage = [...pages.values()].map(({ resp, ...p }) => ({ ...p, medianResponseMs: median(resp) })).sort((a, b) => b.inMsgs + b.comments - (a.inMsgs + a.comments));

  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), overview: ov, daily: [...daily.values()], byPage, byStaff, fastest, tags, tagDaily, heatmap };
}

/* ───────────── Khoảng thời gian ───────────── */

export type RangePreset = "today" | "7d" | "30d" | "month" | "custom";
export const RANGE_LABEL: Record<RangePreset, string> = { today: "Hôm nay", "7d": "7 ngày", "30d": "30 ngày", month: "Tháng này", custom: "Tùy chọn" };
export const MAX_RANGE_DAYS = 366;

/** Nửa đêm địa phương của ngày "YYYY-MM-DD" (ms UTC). */
export function localMidnight(dayKey: string, tz: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Hai lần lặp đủ cho mọi múi giờ (kể cả đổi giờ mùa hè).
  let t = guess - localOffset(guess, tz);
  t = guess - localOffset(t, tz);
  return t;
}
function localOffset(t: number, tz: string) {
  const p = localParts(t, tz);
  const [y, m, d] = p.dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d) + Math.round(p.minutes * 60000) - t;
}
const addDays = (dayKey: string, n: number) => new Date(Date.parse(`${dayKey}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Đổi lựa chọn khoảng thời gian → [from, to) theo giờ địa phương; giới hạn 366 ngày; ngày sai → 7 ngày. */
export function resolveRange(preset: string, fromStr: string | null | undefined, toStr: string | null | undefined, now: number, tz: string): { from: number; to: number; preset: RangePreset; fromDay: string; toDay: string } {
  const today = localParts(now, tz).dayKey;
  const ok = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`));
  let p = (["today", "7d", "30d", "month", "custom"].includes(preset) ? preset : "7d") as RangePreset;
  let a: string;
  let b: string = today; // ngày cuối (gồm cả ngày đó)
  if (p === "today") a = today;
  else if (p === "30d") a = addDays(today, -29);
  else if (p === "month") a = `${today.slice(0, 8)}01`;
  else if (p === "custom" && ok(fromStr) && ok(toStr)) {
    a = fromStr! <= toStr! ? fromStr! : toStr!;
    b = fromStr! <= toStr! ? toStr! : fromStr!;
    if ((Date.parse(b) - Date.parse(a)) / 864e5 + 1 > MAX_RANGE_DAYS) a = addDays(b, -(MAX_RANGE_DAYS - 1));
  } else {
    p = p === "custom" ? "7d" : p;
    a = addDays(today, -6);
  }
  return { from: localMidnight(a, tz), to: localMidnight(addDays(b, 1), tz), preset: p, fromDay: a, toDay: b };
}
