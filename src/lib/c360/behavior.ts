// Chấm điểm theo hành vi phía server: đếm hành vi, tính lại điểm, job hằng giờ.
import type { Record as DbRecord } from "@prisma/client";
import { db } from "../db";
import { getPref, setPref } from "../prefs";
import { scoreContact, type FieldValue } from "../records";
import { fireEvent } from "../automation";
import type { WorkspaceConfig } from "../config/schema";
import { POSITIVE } from "../calls-shared";
import { loadCfg } from "../marketing/store";
import { activeWorkspaces, chunk, dataOf, quietUpdate } from "./common";
import { explainChange, normalizeRules, scoreParts, type ScoreCounts, type ScoreEvent, type ScoringRules } from "./scoring";

export const scoringRules = async (wid: string) => normalizeRules(await getPref<Partial<ScoringRules>>(wid, "scoring", {}));
export const saveScoringRules = (wid: string, r: Partial<ScoringRules>) => setPref(wid, "scoring", normalizeRules(r));

type State = { lastRun: number; lastFull: number };
const stateOf = (wid: string) => getPref<State>(wid, "scoring_state", { lastRun: 0, lastFull: 0 });

type Tally = { counts: ScoreCounts; lastAt: number };

/** Đếm hành vi của nhiều khách trong cửa sổ thời gian; lastAt = lần tương tác gần nhất (để tính trừ điểm). */
export async function behaviorCounts(workspaceId: string, ids: string[], since: Date): Promise<Map<string, Tally>> {
  const out = new Map<string, Tally>(ids.map((id) => [id, { counts: {}, lastAt: 0 }]));
  const add = (id: string | null | undefined, k: ScoreEvent, n: number, at?: Date | null) => {
    const t = id ? out.get(id) : undefined;
    if (!t || !n) return;
    t.counts[k] = (t.counts[k] ?? 0) + n;
    if (at) t.lastAt = Math.max(t.lastAt, at.getTime());
  };
  for (const part of chunk(ids)) {
    const [acts, leads, calls, quotes, orders, tickets, surveys, msgs] = await Promise.all([
      db.activity.groupBy({ by: ["recordId", "kind"], where: { recordId: { in: part }, kind: { in: ["email_open", "email_click"] }, createdAt: { gte: since } }, _count: true, _max: { createdAt: true } }),
      db.leadEvent.groupBy({ by: ["recordId"], where: { workspaceId, recordId: { in: part }, status: { in: ["created", "merged"] }, createdAt: { gte: since } }, _count: true, _max: { createdAt: true } }),
      db.call.groupBy({ by: ["recordId", "outcome"], where: { workspaceId, recordId: { in: part }, createdAt: { gte: since } }, _count: true, _max: { createdAt: true } }),
      db.quote.findMany({ where: { workspaceId, contactId: { in: part }, viewedAt: { gte: since } }, select: { contactId: true, viewedAt: true } }),
      db.order.findMany({ where: { workspaceId, contactId: { in: part }, status: "done", createdAt: { gte: since } }, select: { contactId: true, updatedAt: true } }),
      db.ticket.groupBy({ by: ["recordId"], where: { workspaceId, recordId: { in: part }, createdAt: { gte: since } }, _count: true, _max: { createdAt: true } }),
      db.surveyResponse.findMany({ where: { workspaceId, recordId: { in: part }, submittedAt: { gte: since }, nps: { not: null } }, select: { recordId: true, nps: true, submittedAt: true } }),
      db.message.findMany({ where: { direction: "in", createdAt: { gte: since }, conversation: { workspaceId, recordId: { in: part } } }, select: { createdAt: true, conversation: { select: { recordId: true } } }, take: 20000 }),
    ]);
    for (const a of acts) add(a.recordId, a.kind === "email_open" ? "email_open" : "email_click", a._count, a._max.createdAt);
    for (const l of leads) add(l.recordId, "form_submit", l._count, l._max.createdAt);
    for (const c of calls) {
      const t = c.recordId ? out.get(c.recordId) : undefined;
      if (t && c._max.createdAt) t.lastAt = Math.max(t.lastAt, c._max.createdAt.getTime());
      if (POSITIVE.has(c.outcome)) add(c.recordId, "call_positive", c._count, c._max.createdAt);
    }
    for (const q of quotes) add(q.contactId, "quote_viewed", 1, q.viewedAt);
    for (const o of orders) add(o.contactId, "order_done", 1, o.updatedAt);
    for (const t of tickets) add(t.recordId, "ticket_open", t._count, t._max.createdAt);
    for (const s of surveys) {
      if ((s.nps ?? 0) >= 9) add(s.recordId, "survey_promoter", 1, s.submittedAt);
      else if ((s.nps ?? 10) <= 6) add(s.recordId, "survey_detractor", 1, s.submittedAt);
    }
    for (const m of msgs) add(m.conversation.recordId, "message_in", 1, m.createdAt);
  }
  return out;
}

const idleDaysOf = (r: Pick<DbRecord, "createdAt">, t: Tally | undefined, now: number) => Math.max(0, (now - Math.max(t?.lastAt ?? 0, r.createdAt.getTime())) / 864e5);

/** Vì sao khách có điểm này: nền hồ sơ, từng hành vi, trừ vì lâu không tương tác. */
export async function scoreBreakdown(workspaceId: string, recordId: string, cfg?: WorkspaceConfig) {
  const rec = await db.record.findFirst({ where: { id: recordId, workspaceId } });
  if (!rec) return null;
  const c = cfg ?? (await loadCfg(workspaceId));
  const rules = await scoringRules(workspaceId);
  const now = Date.now();
  const tally = (await behaviorCounts(workspaceId, [rec.id], new Date(now - rules.windowDays * 864e5))).get(rec.id);
  const profile = c ? scoreContact(dataOf(rec) as Record<string, FieldValue>, c) : rec.score;
  return { current: rec.score, profile, windowDays: rules.windowDays, enabled: rules.enabled, ...scoreParts(profile, tally?.counts ?? {}, idleDaysOf(rec, tally, now), rules) };
}

/**
 * Tính lại điểm cho các khách (mặc định: mọi khách). Cập nhật khi đổi; đổi từ 10 điểm thì ghi dòng hoạt động
 * và phát sự kiện score_above cho tự động hoá. quiet = lần chạy đầu (lấy mốc): không ghi hoạt động, không phát sự kiện.
 */
export async function recomputeScores(workspaceId: string, cfg: WorkspaceConfig, opts: { ids?: string[]; quiet?: boolean } = {}) {
  const rules = await scoringRules(workspaceId);
  if (!rules.enabled) return { checked: 0, changed: 0 };
  const now = Date.now();
  const recs = await db.record.findMany({ where: { workspaceId, objectKey: "contacts", ...(opts.ids ? { id: { in: opts.ids } } : {}) } });
  const tallies = await behaviorCounts(
    workspaceId,
    recs.map((r) => r.id),
    new Date(now - rules.windowDays * 864e5),
  );
  let changed = 0;
  for (const r of recs) {
    const t = tallies.get(r.id);
    const p = scoreParts(scoreContact(dataOf(r) as Record<string, FieldValue>, cfg), t?.counts ?? {}, idleDaysOf(r, t, now), rules);
    if (p.score === r.score) continue;
    const after = await quietUpdate(r, { score: p.score });
    changed++;
    if (opts.quiet) continue;
    if (Math.abs(p.score - r.score) >= 10) await db.activity.create({ data: { recordId: r.id, kind: "score", body: explainChange(r.score, p), author: "Chấm điểm hành vi" } });
    await fireEvent(workspaceId, cfg, { kind: "score_above", record: after, score: p.score, prevScore: r.score });
  }
  return { checked: recs.length, changed };
}

/** Khách có tương tác mới kể từ một thời điểm (để job hằng giờ chỉ tính lại những người này). */
async function touchedSince(workspaceId: string, since: Date) {
  const ids = new Set<string>();
  const put = (xs: { id?: string | null }[]) => xs.forEach((x) => x.id && ids.add(x.id));
  const [acts, leads, calls, quotes, orders, tickets, surveys, convs] = await Promise.all([
    db.activity.findMany({ where: { createdAt: { gte: since }, record: { workspaceId, objectKey: "contacts" } }, select: { recordId: true }, distinct: ["recordId"], take: 5000 }),
    db.leadEvent.findMany({ where: { workspaceId, createdAt: { gte: since }, recordId: { not: null } }, select: { recordId: true }, distinct: ["recordId"], take: 5000 }),
    db.call.findMany({ where: { workspaceId, createdAt: { gte: since }, recordId: { not: null } }, select: { recordId: true }, distinct: ["recordId"], take: 5000 }),
    db.quote.findMany({ where: { workspaceId, updatedAt: { gte: since }, contactId: { not: null } }, select: { contactId: true }, distinct: ["contactId"], take: 5000 }),
    db.order.findMany({ where: { workspaceId, updatedAt: { gte: since }, contactId: { not: null } }, select: { contactId: true }, distinct: ["contactId"], take: 5000 }),
    db.ticket.findMany({ where: { workspaceId, createdAt: { gte: since }, recordId: { not: null } }, select: { recordId: true }, distinct: ["recordId"], take: 5000 }),
    db.surveyResponse.findMany({ where: { workspaceId, submittedAt: { gte: since }, recordId: { not: null } }, select: { recordId: true }, distinct: ["recordId"], take: 5000 }),
    db.conversation.findMany({ where: { workspaceId, lastAt: { gte: since }, recordId: { not: null } }, select: { recordId: true }, take: 5000 }),
  ]);
  put(acts.map((x) => ({ id: x.recordId })));
  for (const xs of [leads, calls, tickets, surveys, convs]) put(xs.map((x) => ({ id: x.recordId })));
  put(quotes.map((x) => ({ id: x.contactId })));
  put(orders.map((x) => ({ id: x.contactId })));
  return [...ids];
}

/**
 * Job hằng giờ: tính lại điểm cho khách vừa có tương tác; mỗi ngày một lần tính lại tất cả (để trừ điểm khách lâu im lặng).
 * Lần chạy đầu của workspace chỉ lấy mốc (không ghi hoạt động/phát sự kiện).
 */
export async function tickBehaviorScores(now = Date.now()): Promise<void> {
  for (const { workspaceId, cfg } of await activeWorkspaces()) {
    const rules = await scoringRules(workspaceId);
    if (!rules.enabled) continue;
    const st = await stateOf(workspaceId);
    const first = !st.lastRun;
    const full = first || now - st.lastFull > 864e5;
    // Lùi 5 phút để không sót sự kiện ghi đúng lúc job chạy.
    const ids = full ? undefined : await touchedSince(workspaceId, new Date(st.lastRun - 5 * 60e3));
    if (ids && !ids.length) {
      await setPref(workspaceId, "scoring_state", { ...st, lastRun: now });
      continue;
    }
    await recomputeScores(workspaceId, cfg, { ids, quiet: first });
    await setPref(workspaceId, "scoring_state", { lastRun: now, lastFull: full ? now : st.lastFull });
  }
}
