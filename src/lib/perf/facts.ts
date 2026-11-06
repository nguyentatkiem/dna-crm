// Nạp dữ liệu thô cho bộ máy đo lường hiệu suất (chỉ chạy phía server).
// Một lượt nạp ≈ 15 truy vấn chạy song song cho cả cửa sổ thời gian, không có N+1; mọi phép tính nằm ở metrics.ts.
import { db } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { wonLost } from "../metrics";
import { memberNames, revenueOwner, teamOf } from "../kpi";
import { allMembers, listTeams, ownerNames, type TeamDTO } from "./teams";
import { MAX_RANGE_DAYS, type Facts } from "./metrics";

const DAY = 864e5;
/** Giới hạn số dòng mỗi loại để một workspace rất lớn không làm treo trang. */
const CAP = 50_000;
const LEAD_CAP = 5_000;
export const STALE_DAYS_DEFAULT = 14;

/** Tên bot / hệ thống ghi hoạt động: không tính là nhân viên. */
const NON_HUMAN_KINDS = new Set(["system", "ai", "score", "message", "sequence", "sequence_reply", "email_open", "email_click"]);

/** Chia mảng id thành nhóm nhỏ để mệnh đề IN không vượt giới hạn biến của SQLite. */
function chunks<T>(xs: T[], n = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
async function inChunks<T, R>(ids: T[], q: (part: T[]) => Promise<R[]>): Promise<R[]> {
  if (!ids.length) return [];
  return (await Promise.all(chunks(ids).map(q))).flat();
}

/**
 * Người được đo: đội trong cấu hình + tài khoản thành viên + thành viên các đội.
 * Chủ doanh nghiệp chỉ có mặt khi được xếp vào đội (giống trang Đánh giá / Hoa hồng).
 */
export async function perfPeople(workspaceId: string, cfg: WorkspaceConfig): Promise<{ people: string[]; teams: TeamDTO[] }> {
  const [names, teams, owners] = await Promise.all([memberNames(workspaceId), listTeams(workspaceId), ownerNames(workspaceId)]);
  const inTeam = new Set(teams.flatMap(allMembers));
  const people = [...new Set([...teamOf(cfg, names).filter((n) => !owners.has(n) || inTeam.has(n)), ...inTeam])].sort((a, b) => a.localeCompare(b, "vi"));
  return { people, teams };
}

type CacheEntry = { at: number; facts: Facts };
const g = globalThis as unknown as { perfFactsCache?: Map<string, CacheEntry> };
const cache = (g.perfFactsCache ??= new Map());
const TTL = 20_000;

/**
 * Dữ liệu thô của cửa sổ [from, to) cho các tên trong `people` (tên ngoài danh sách vẫn được giữ lại
 * nếu là người phụ trách / người gọi, để số của cả công ty không bị hụt).
 * Kết quả được nhớ 20 giây theo workspace + cửa sổ (trang tổng quan, xuất Excel, hồ sơ dùng chung).
 */
export async function loadFacts(workspaceId: string, cfg: WorkspaceConfig, people: string[], win: { from: number; to: number }, opts: { staleDays?: number; now?: number } = {}): Promise<Facts> {
  const now = opts.now ?? Date.now();
  const staleDays = opts.staleDays ?? STALE_DAYS_DEFAULT;
  const from = Math.max(win.from, win.to - (2 * MAX_RANGE_DAYS + 70) * DAY);
  const key = `${workspaceId}|${Math.floor(from / 60e3)}|${Math.floor(win.to / 60e3)}|${staleDays}|${people.join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL) return hit.facts;
  const facts = await load(workspaceId, cfg, people, new Date(from), new Date(win.to), now, staleDays);
  cache.set(key, { at: now, facts });
  if (cache.size > 50) for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
  return facts;
}

/** Xoá bộ nhớ đệm (sau khi gieo dữ liệu mẫu). */
export const clearFactsCache = () => cache.clear();

async function load(workspaceId: string, cfg: WorkspaceConfig, people: string[], from: Date, to: Date, now: number, staleDays: number): Promise<Facts> {
  const staff = new Set(people);
  const deals = getObject(cfg, "deals");
  const { won, lost } = wonLost(cfg);
  const closedKeys = [...won, ...lost];
  const openKeys = (deals?.statuses ?? []).map((s) => s.key).filter((k) => !won.has(k) && !lost.has(k));
  const range = { gte: from, lt: to };

  const [anyPayment, pays, closedRows, leadRows, orderRows, firstOrders, debtRows, calls, convs, msgs, acts, quotes, tasks, tickets, surveys, staleRows] = await Promise.all([
    db.payment.findFirst({ where: { workspaceId }, select: { id: true } }),
    db.payment.findMany({ where: { workspaceId, paidAt: range }, select: { amount: true, paidAt: true, createdBy: true, order: { select: { createdBy: true, recordId: true, contactId: true } } }, take: CAP }),
    closedKeys.length ? db.record.findMany({ where: { workspaceId, objectKey: "deals", deletedAt: null, status: { in: closedKeys }, updatedAt: { gte: from } }, select: { id: true, status: true, ownerName: true, amount: true, createdAt: true, updatedAt: true }, take: CAP }) : Promise.resolve([]),
    db.record.findMany({ where: { workspaceId, objectKey: "contacts", deletedAt: null, createdAt: range }, select: { id: true, ownerName: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: LEAD_CAP }),
    db.order.findMany({ where: { workspaceId, createdAt: range, status: { not: "cancelled" } }, select: { createdAt: true, contactId: true, recordId: true, createdBy: true }, take: CAP }),
    db.order.groupBy({ by: ["contactId"], where: { workspaceId, status: { not: "cancelled" }, contactId: { not: null }, createdAt: { lt: to } }, _min: { createdAt: true } }),
    db.order.findMany({ where: { workspaceId, dueAt: { lt: new Date(now) }, status: { not: "cancelled" } }, select: { total: true, paid: true, contactId: true, recordId: true, createdBy: true }, take: CAP }),
    db.call.findMany({ where: { workspaceId, startedAt: range }, select: { agentName: true, startedAt: true, durationSec: true, outcome: true, aiScore: true, reviewScore: true }, take: CAP }),
    db.conversation.findMany({ where: { workspaceId }, select: { id: true, assignee: true } }),
    db.message.findMany({ where: { conversation: { workspaceId }, createdAt: range, direction: { in: ["in", "out"] } }, select: { conversationId: true, direction: true, author: true, createdAt: true }, orderBy: [{ conversationId: "asc" }, { createdAt: "asc" }], take: CAP }),
    people.length ? db.activity.findMany({ where: { record: { workspaceId }, createdAt: range, author: { in: people }, kind: { notIn: [...NON_HUMAN_KINDS] } }, select: { author: true, createdAt: true }, take: CAP }) : Promise.resolve([]),
    db.quote.findMany({ where: { workspaceId, createdAt: range, status: { in: ["sent", "accepted", "rejected", "expired"] } }, select: { createdBy: true, createdAt: true }, take: CAP }),
    db.task.findMany({ where: { workspaceId, inTrash: false, dueAt: range }, select: { assignee: true, dueAt: true, done: true }, take: CAP }),
    db.ticket.findMany({ where: { workspaceId, OR: [{ createdAt: range }, { resolvedAt: range }] }, select: { id: true, assignee: true, createdAt: true, resolvedAt: true, dueAt: true, csat: true, category: true, recordId: true }, take: CAP }),
    db.surveyResponse.findMany({ where: { workspaceId, submittedAt: range, nps: { not: null } }, select: { recordId: true, ticketId: true, nps: true, submittedAt: true }, take: CAP }),
    openKeys.length ? db.record.findMany({ where: { workspaceId, objectKey: "deals", deletedAt: null, status: { in: openKeys }, updatedAt: { lt: new Date(now - staleDays * DAY) } }, select: { id: true, title: true, ownerName: true, amount: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 2000 }) : Promise.resolve([]),
  ]);

  // ----- Pha 2: thời điểm đóng giao dịch, chủ sở hữu bản ghi, điểm chạm khách mới -----
  const leadIds = leadRows.map((l) => l.id);
  const ownerIds = [...new Set([...pays.flatMap((p) => [p.order?.recordId, p.order?.contactId]), ...orderRows.flatMap((o) => [o.recordId, o.contactId]), ...debtRows.flatMap((o) => [o.recordId, o.contactId]), ...tickets.map((t) => t.recordId), ...surveys.map((s) => s.recordId)].filter((x): x is string => !!x))];
  const missingTickets = [...new Set(surveys.map((s) => s.ticketId).filter((x): x is string => !!x && !tickets.some((t) => t.id === x)))];
  const [statusActs, ownerRows, leadEvents, leadCalls, leadConvs, leadActs, extraTickets] = await Promise.all([
    inChunks(closedRows.map((r) => r.id), (ids) => db.activity.findMany({ where: { recordId: { in: ids }, kind: "system", body: { contains: " sang “" } }, select: { recordId: true, body: true, createdAt: true }, orderBy: { createdAt: "desc" } })),
    inChunks(ownerIds, (ids) => db.record.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, objectKey: true, ownerName: true } })),
    inChunks(leadIds, (ids) => db.leadEvent.findMany({ where: { workspaceId, recordId: { in: ids } }, select: { recordId: true, createdAt: true } })),
    inChunks(leadIds, (ids) => db.call.findMany({ where: { workspaceId, recordId: { in: ids } }, select: { recordId: true, agentName: true, startedAt: true } })),
    inChunks(leadIds, (ids) => db.conversation.findMany({ where: { workspaceId, recordId: { in: ids } }, select: { recordId: true, assignee: true, messages: { where: { direction: "out" }, select: { author: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 20 } } })),
    inChunks(leadIds, (ids) => db.activity.findMany({ where: { recordId: { in: ids }, kind: { notIn: [...NON_HUMAN_KINDS] }, author: { in: people.length ? people : ["\u0000"] } }, select: { recordId: true, author: true, createdAt: true } })),
    inChunks(missingTickets, (ids) => db.ticket.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, assignee: true } })),
  ]);

  const owners = new Map(ownerRows.map((r) => [r.id, r]));
  const ownerOf = (id: string | null | undefined) => (id ? (owners.get(id)?.ownerName ?? "") : "");
  const attribute = (o: { recordId?: string | null; contactId?: string | null; createdBy?: string | null }, paymentCreatedBy?: string) => {
    const deal = o.recordId ? owners.get(o.recordId) : undefined;
    return revenueOwner({ dealOwner: deal?.objectKey === "deals" ? deal.ownerName : "", contactOwner: ownerOf(o.contactId), orderCreatedBy: o.createdBy, paymentCreatedBy });
  };

  // Giao dịch đóng: thời điểm = hoạt động hệ thống "… sang “<trạng thái>”" mới nhất, không có thì updatedAt (như KPI).
  const actsBy = new Map<string, { body: string; createdAt: Date }[]>();
  for (const a of statusActs) (actsBy.get(a.recordId) ?? actsBy.set(a.recordId, []).get(a.recordId)!).push(a);
  const closed: Facts["closed"] = [];
  for (const r of closedRows) {
    const label = deals?.statuses.find((s) => s.key === r.status)?.label ?? r.status;
    const act = actsBy.get(r.id)?.find((a) => a.body.endsWith(`sang “${label}”`));
    const at = (act?.createdAt ?? r.updatedAt).getTime();
    if (at < from.getTime() || at >= to.getTime()) continue;
    closed.push({ who: r.ownerName, at, won: won.has(r.status), amount: r.amount, createdAt: r.createdAt.getTime() });
  }

  // Khách mới: thời điểm vào = sự kiện lead sớm nhất (nếu có) hoặc lúc tạo khách; điểm chạm đầu tiên của chính người phụ trách.
  const arrival = new Map(leadRows.map((l) => [l.id, l.createdAt.getTime()]));
  for (const e of leadEvents) if (e.recordId && arrival.has(e.recordId)) arrival.set(e.recordId, Math.min(arrival.get(e.recordId)!, e.createdAt.getTime()));
  const leadOwner = new Map(leadRows.map((l) => [l.id, l.ownerName]));
  const touch = new Map<string, number>();
  const addTouch = (rid: string | null, who: string, at: Date) => {
    if (!rid || !who || leadOwner.get(rid) !== who) return;
    const t = at.getTime();
    if (t < (arrival.get(rid) ?? 0)) return;
    if (!touch.has(rid) || t < touch.get(rid)!) touch.set(rid, t);
  };
  for (const c of leadCalls) addTouch(c.recordId, c.agentName, c.startedAt);
  for (const c of leadConvs) for (const m of c.messages) addTouch(c.recordId, staff.has(m.author) ? m.author : c.assignee, m.createdAt);
  for (const a of leadActs) addTouch(a.recordId, a.author, a.createdAt);
  const leads: Facts["leads"] = leadRows.map((l) => ({ who: l.ownerName, at: arrival.get(l.id)!, firstTouch: touch.get(l.id) ?? null }));

  // Đơn hàng + khách quay lại (đơn này sau đơn đầu tiên của khách).
  const firstAt = new Map(firstOrders.map((r) => [r.contactId!, r._min.createdAt?.getTime() ?? 0]));
  const orders: Facts["orders"] = orderRows.map((o) => ({ who: attribute(o), at: o.createdAt.getTime(), contactId: o.contactId, returning: !!o.contactId && o.createdAt.getTime() > (firstAt.get(o.contactId) ?? Infinity) }));

  const debts: Facts["debts"] = {};
  for (const o of debtRows) {
    const left = o.total - o.paid;
    if (!(left > 0.5)) continue;
    const d = (debts[attribute(o)] ??= { amount: 0, count: 0 });
    d.amount += left;
    d.count++;
  }

  // Hộp thư: tin gửi đi + thời gian phản hồi (tin khách đầu tiên sau lượt trả lời trước → tin trả lời kế tiếp).
  const assigneeOf = new Map(convs.map((c) => [c.id, c.assignee]));
  const replies: Facts["replies"] = [];
  const responses: Facts["responses"] = [];
  let conv = "";
  let waitFrom: number | null = null;
  for (const m of msgs) {
    if (m.conversationId !== conv) {
      conv = m.conversationId;
      waitFrom = null;
    }
    const at = m.createdAt.getTime();
    if (m.direction === "in") {
      waitFrom ??= at;
      continue;
    }
    const who = staff.has(m.author) ? m.author : (assigneeOf.get(m.conversationId) ?? "");
    replies.push({ who, at });
    if (waitFrom != null) {
      responses.push({ who, at: waitFrom, min: (at - waitFrom) / 60e3 });
      waitFrom = null;
    }
  }

  const ticketAssignee = new Map([...tickets, ...extraTickets].map((t) => [t.id, t.assignee]));
  const complaintRe = /khiếu\s*nại/i;

  return {
    now,
    revenueSource: anyPayment ? "payments" : "deals",
    payments: pays.map((p) => ({ who: p.order ? attribute(p.order, p.createdBy) : p.createdBy, at: p.paidAt.getTime(), amount: p.amount })),
    closed,
    leads,
    orders,
    calls: calls.map((c) => ({ who: c.agentName, at: c.startedAt.getTime(), dur: c.durationSec, outcome: c.outcome, score: c.reviewScore ?? c.aiScore ?? null })),
    replies,
    responses,
    notes: acts.map((a) => ({ who: a.author, at: a.createdAt.getTime() })),
    quotes: quotes.map((q) => ({ who: q.createdBy, at: q.createdAt.getTime() })),
    tasks: tasks.map((t) => ({ who: t.assignee, due: t.dueAt!.getTime(), done: t.done })),
    tickets: tickets.map((t) => ({ who: t.assignee, createdAt: t.createdAt.getTime(), resolvedAt: t.resolvedAt?.getTime() ?? null, dueAt: t.dueAt?.getTime() ?? null, csat: t.csat })),
    surveys: surveys.map((s) => ({ who: ownerOf(s.recordId) || (s.ticketId ? (ticketAssignee.get(s.ticketId) ?? "") : ""), at: s.submittedAt!.getTime(), nps: s.nps })),
    complaints: tickets.filter((t) => complaintRe.test(t.category) && t.createdAt >= from && t.createdAt < to).map((t) => ({ who: ownerOf(t.recordId) || t.assignee, at: t.createdAt.getTime() })),
    debts,
    stale: staleRows.map((r) => ({ who: r.ownerName, id: r.id, title: r.title, amount: r.amount, idleDays: Math.floor((now - r.updatedAt.getTime()) / DAY) })),
  };
}
