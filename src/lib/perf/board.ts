// Dữ liệu cho trang Tổng quan hiệu suất và Hồ sơ hiệu suất cá nhân (server). Áp quyền qua PerfAccess.
import { db } from "../db";
import type { WorkspaceConfig } from "../config/schema";
import { getPref } from "../prefs";
import { userIdByName } from "../notify";
import { currentPeriod, kpiBoard, type KpiRow } from "../kpi";
import { allMembers, type TeamDTO } from "./teams";
import type { PerfAccess } from "./access";
import { loadFacts, perfPeople, STALE_DAYS_DEFAULT } from "./facts";
import {
  buildAlerts,
  computeMetrics,
  delta,
  fmtValue,
  funnel,
  heatmap,
  leadTouchStats,
  LEADER_KEYS,
  medians,
  METRIC_DEFS,
  METRIC_KEYS,
  normWeights,
  perfScores,
  ranks,
  resolveRange,
  strengthsWeaknesses,
  weekSpans,
  weeklySeries,
  isMetricKey,
  type Delta,
  type Facts,
  type FunnelStep,
  type Insight,
  type MetricKey,
  type PerfAlert,
  type ResolvedRange,
  type ScoreWeights,
  type Values,
} from "./metrics";

export type PerfScorePref = { weights: ScoreWeights; staleDays: number };

/** Pref "perfScore": trọng số điểm hiệu suất + số ngày coi là tồn đọng. */
export async function perfScorePref(workspaceId: string): Promise<PerfScorePref> {
  const p = await getPref<Partial<PerfScorePref>>(workspaceId, "perfScore", {});
  const sd = Number(p.staleDays);
  return { weights: normWeights(p.weights), staleDays: Number.isFinite(sd) && sd >= 1 && sd <= 365 ? Math.round(sd) : STALE_DAYS_DEFAULT };
}

export type RangeInput = { preset?: string | null; from?: string | null; to?: string | null; now?: number };

/** Một bộ dữ liệu dùng chung: người, đội, khoảng thời gian, dữ liệu thô, chỉ số mọi người (kỳ này / kỳ trước), điểm. */
async function base(workspaceId: string, cfg: WorkspaceConfig, r: RangeInput, extra: string[] = [], weeksN = 8) {
  const now = r.now ?? Date.now();
  const range = resolveRange(r.preset, now, r.from, r.to);
  const weeks = weekSpans(range.cur.to, weeksN);
  const [{ people: list, teams }, pref] = await Promise.all([perfPeople(workspaceId, cfg), perfScorePref(workspaceId)]);
  const people = extra.length ? [...new Set([...list, ...extra])] : list;
  const facts = await loadFacts(workspaceId, cfg, people, { from: Math.min(range.prev.from, weeks[0].from), to: range.cur.to }, { staleDays: pref.staleDays, now });
  const cur: Record<string, Values> = {};
  const prev: Record<string, Values> = {};
  for (const p of people) {
    cur[p] = computeMetrics(facts, p, range.cur);
    prev[p] = computeMetrics(facts, p, range.prev);
  }
  const sc = perfScores(cur, pref.weights);
  const scPrev = perfScores(prev, pref.weights);
  return { now, range, weeks, people, teams, pref, facts, cur, prev, sc, scPrev };
}

export type MetricCell = { v: number | null; prev: number | null; d: Delta | null; pct: number | null };
export type OverviewRow = { who: string; teams: string[]; score: number | null; scorePrev: number | null; rank: number; cells: Record<MetricKey, MetricCell>; funnel: FunnelStep[] };

export type Overview = {
  range: ResolvedRange & { from: string; to: string };
  scope: PerfAccess["scope"];
  me: string;
  canConfigure: boolean;
  teams: { id: string; name: string; color: string }[];
  teamId: string;
  /** Số người trong nhóm so sánh (đội đang lọc hoặc cả công ty). */
  population: number;
  rows: OverviewRow[];
  /** Trung vị nhóm so sánh từng chỉ số. */
  median: Values;
  /** Tổng hợp của nhóm đang xem (cả công ty / đội) — không có với nhân viên. */
  group: { label: string; cells: Record<MetricKey, MetricCell>; funnel: FunnelStep[] } | null;
  heatmap: number[][];
  heatmapLabel: string;
  trend: { metric: MetricKey; weeks: string[]; series: { who: string; values: (number | null)[] }[] };
  alerts: PerfAlert[];
  weights: ScoreWeights;
  staleDays: number;
  revenueSource: Facts["revenueSource"];
};

const iso = (t: number) => new Date(t).toISOString();

function cells(cur: Values, prev: Values, pct: Partial<Record<MetricKey, number>> = {}): Record<MetricKey, MetricCell> {
  const out = {} as Record<MetricKey, MetricCell>;
  for (const k of METRIC_KEYS) {
    const snap = METRIC_DEFS[k].snapshot;
    out[k] = { v: cur[k], prev: snap ? null : prev[k], d: snap ? null : delta(cur[k], prev[k], METRIC_DEFS[k].higherBetter), pct: pct[k] ?? null };
  }
  return out;
}

const teamsOfName = (teams: TeamDTO[], who: string) => teams.filter((t) => allMembers(t).includes(who));

/**
 * Bảng tổng quan. Quyền:
 * - all (chủ/quản lý): mọi người; lọc theo đội tuỳ chọn.
 * - team (trưởng nhóm): thành viên các đội mình dẫn (lọc thêm theo đội được).
 * - self (nhân viên): chỉ hàng của mình + thứ hạng + trung vị đội; không thấy số của người khác.
 * Màu bách phân vị (pct) tính trong nhóm so sánh = đội đang lọc, hoặc đội của người đó, hoặc cả công ty.
 */
export async function overviewBoard(workspaceId: string, cfg: WorkspaceConfig, access: PerfAccess, opts: RangeInput & { teamId?: string | null; metric?: string | null }): Promise<Overview> {
  const b = await base(workspaceId, cfg, opts);
  const { range, people, teams, facts, cur, prev, sc, scPrev } = b;

  // Đội được phép lọc.
  const allowedTeams = access.canSeeAll ? teams : access.scope === "team" ? access.ledTeams : teamsOfName(teams, access.me);
  let team = opts.teamId ? allowedTeams.find((t) => t.id === opts.teamId) : undefined;
  if (!team && access.scope === "team" && access.ledTeams.length === 1) team = access.ledTeams[0];

  // Nhóm so sánh và người hiển thị.
  // Nhân viên: so với tất cả các đội mình thuộc (giống trang hồ sơ); trưởng nhóm: các đội mình dẫn.
  const union = (ts: TeamDTO[]) => [...new Set(ts.flatMap(allMembers))].filter((p) => people.includes(p));
  const popNames = team ? union([team]) : access.scope === "self" ? (teamsOfName(teams, access.me).length ? union(teamsOfName(teams, access.me)) : people) : access.scope === "team" ? union(access.ledTeams) : people;
  const population = popNames.length ? popNames : people;
  const visible = access.scope === "self" ? (people.includes(access.me) ? [access.me] : []) : access.visible(population);

  const popVals = Object.fromEntries(population.map((p) => [p, cur[p]]));
  const popScore = perfScores(popVals, b.pref.weights);
  const rk = ranks(Object.fromEntries(population.map((p) => [p, sc.score[p]])));
  const rows: OverviewRow[] = visible
    .map((who) => ({ who, teams: teamsOfName(teams, who).map((t) => t.name), score: sc.score[who], scorePrev: scPrev.score[who], rank: rk[who] ?? population.length, cells: cells(cur[who], prev[who], popScore.pct[who]), funnel: funnel(facts, who, range.cur) }))
    .sort((a, b2) => a.rank - b2.rank || a.who.localeCompare(b2.who, "vi"));

  const groupNames = access.scope === "self" ? [] : visible;
  const groupLabel = team ? `Đội ${team.name}` : access.scope === "team" ? "Đội của bạn" : "Cả công ty";
  const group = groupNames.length ? { label: groupLabel, cells: cells(computeMetrics(facts, groupNames, range.cur), computeMetrics(facts, groupNames, range.prev)), funnel: funnel(facts, groupNames, range.cur) } : null;

  const metric: MetricKey = opts.metric && isMetricKey(opts.metric) && !METRIC_DEFS[opts.metric].snapshot ? opts.metric : "revenue";
  const trendPeople = rows.slice(0, 10).map((r) => r.who);
  const fmt = (k: MetricKey, v: number) => fmtValue(k, v);

  return {
    range: { ...range, from: iso(range.cur.from), to: iso(range.cur.to) },
    scope: access.scope,
    me: access.me,
    canConfigure: access.canConfigure,
    teams: allowedTeams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    teamId: team?.id ?? "",
    population: population.length,
    rows,
    median: medians(population.map((p) => cur[p])),
    group,
    heatmap: heatmap(facts, visible, range.cur),
    heatmapLabel: access.scope === "self" ? "Của bạn" : groupLabel,
    trend: { metric, weeks: b.weeks.map((w) => w.label), series: trendPeople.map((who) => ({ who, values: weeklySeries(facts, who, metric, b.weeks) })) },
    alerts: buildAlerts(rows.map((r) => ({ who: r.who, cur: cur[r.who], prev: prev[r.who] })), fmt),
    weights: b.pref.weights,
    staleDays: b.pref.staleDays,
    revenueSource: facts.revenueSource,
  };
}

export type PersonCard = { key: MetricKey; v: number | null; prev: number | null; d: Delta | null; median: number | null; spark: (number | null)[] };

export type PersonBoard = {
  who: string;
  range: ResolvedRange & { from: string; to: string };
  teams: { id: string; name: string; color: string; leader: string }[];
  compareLabel: string;
  score: number | null;
  scorePrev: number | null;
  rank: number;
  rankOf: number;
  cards: PersonCard[];
  weeks: string[];
  leads: { leads: number; touched: number };
  funnel: FunnelStep[];
  heatmap: number[][];
  kpi: { period: string; row: KpiRow | null; day: number; days: number };
  stale: Facts["stale"];
  overdueTasks: { id: string; title: string; dueAt: string; recordId: string | null; href: string }[];
  recentCalls: { id: string; startedAt: string; outcome: string; durationSec: number; score: number | null; summary: string }[];
  reviews: { period: string; total: number; status: string; reviewer: string; comment: string }[];
  insights: { strengths: Insight[]; weaknesses: Insight[] };
  debt: { amount: number; count: number };
  staleDays: number;
  canReview: boolean;
  revenueSource: Facts["revenueSource"];
};

/** Hồ sơ hiệu suất một người. Gọi sau khi đã kiểm tra access.canSeePerson(who). */
export async function personBoard(workspaceId: string, cfg: WorkspaceConfig, access: PerfAccess, who: string, opts: RangeInput): Promise<PersonBoard | null> {
  // Tài khoản thành viên không nằm trong danh sách đo (ví dụ chủ doanh nghiệp không thuộc đội) vẫn xem được hồ sơ của mình.
  const extra = (await userIdByName(workspaceId, who)) ? [who] : [];
  const b = await base(workspaceId, cfg, opts, extra);
  const { range, people, teams, facts, cur, prev, sc, scPrev } = b;
  if (!people.includes(who)) return null;
  const myTeams = teamsOfName(teams, who);
  const pop = myTeams.length ? [...new Set(myTeams.flatMap(allMembers))].filter((p) => people.includes(p)) : people;
  const med = medians(pop.map((p) => cur[p]));
  const rk = ranks(Object.fromEntries(pop.map((p) => [p, sc.score[p]])));
  const nowD = new Date(b.now);
  const period = currentPeriod(nowD);

  const [kb, tasks, calls, reviews] = await Promise.all([
    kpiBoard(workspaceId, cfg, period, nowD),
    db.task.findMany({ where: { workspaceId, assignee: who, done: false, inTrash: false, dueAt: { lt: nowD } }, select: { id: true, title: true, dueAt: true, recordId: true }, orderBy: { dueAt: "asc" }, take: 20 }),
    db.call.findMany({ where: { workspaceId, agentName: who }, select: { id: true, startedAt: true, outcome: true, durationSec: true, aiScore: true, reviewScore: true, summary: true }, orderBy: { startedAt: "desc" }, take: 10 }),
    db.perfReview.findMany({ where: { workspaceId, who }, select: { period: true, total: true, status: true, reviewer: true, comment: true }, orderBy: { period: "desc" }, take: 12 }),
  ]);
  const taskRecs = tasks.some((t) => t.recordId) ? await db.record.findMany({ where: { workspaceId, id: { in: tasks.map((t) => t.recordId).filter((x): x is string => !!x) } }, select: { id: true, objectKey: true } }) : [];

  return {
    who,
    range: { ...range, from: iso(range.cur.from), to: iso(range.cur.to) },
    teams: myTeams.map((t) => ({ id: t.id, name: t.name, color: t.color, leader: t.leader })),
    compareLabel: myTeams.length ? `trung vị đội ${myTeams.map((t) => t.name).join(", ")}` : "trung vị cả công ty",
    score: sc.score[who],
    scorePrev: scPrev.score[who],
    rank: rk[who] ?? pop.length,
    rankOf: pop.length,
    cards: METRIC_KEYS.map((k) => ({ key: k, v: cur[who][k], prev: METRIC_DEFS[k].snapshot ? null : prev[who][k], d: METRIC_DEFS[k].snapshot ? null : delta(cur[who][k], prev[who][k], METRIC_DEFS[k].higherBetter), median: med[k], spark: weeklySeries(facts, who, k, b.weeks) })),
    weeks: b.weeks.map((w) => w.label),
    leads: leadTouchStats(facts, who, range.cur),
    funnel: funnel(facts, who, range.cur),
    heatmap: heatmap(facts, who, range.cur),
    kpi: { period, row: kb.rows.find((r) => r.who === who) ?? null, day: kb.day, days: kb.days },
    stale: facts.stale.filter((s) => s.who === who).slice(0, 30),
    overdueTasks: tasks.map((t) => {
      const rec = taskRecs.find((r) => r.id === t.recordId);
      return { id: t.id, title: t.title, dueAt: t.dueAt!.toISOString(), recordId: t.recordId, href: rec ? `/w/b/${rec.objectKey}?open=${rec.id}` : "/w/my-work" };
    }),
    recentCalls: calls.map((c) => ({ id: c.id, startedAt: c.startedAt.toISOString(), outcome: c.outcome, durationSec: c.durationSec, score: c.reviewScore ?? c.aiScore ?? null, summary: c.summary.slice(0, 160) })),
    reviews: reviews.map((r) => ({ ...r, comment: r.comment.slice(0, 300) })),
    insights: strengthsWeaknesses(cur[who], med),
    debt: facts.debts[who] ?? { amount: 0, count: 0 },
    staleDays: b.pref.staleDays,
    canReview: access.canReview,
    revenueSource: facts.revenueSource,
  };
}

/** Chỉ số của mọi người trong một tháng (cho tiêu chí đánh giá nguồn "metric:<key>"). */
export async function monthMetrics(workspaceId: string, cfg: WorkspaceConfig, from: Date, to: Date): Promise<Record<string, Values>> {
  const { people } = await perfPeople(workspaceId, cfg);
  const pref = await perfScorePref(workspaceId);
  const facts = await loadFacts(workspaceId, cfg, people, { from: from.getTime(), to: to.getTime() }, { staleDays: pref.staleDays });
  return Object.fromEntries(people.map((p) => [p, computeMetrics(facts, p, { from: from.getTime(), to: to.getTime() })]));
}

export { LEADER_KEYS };

/** Đọc khoảng thời gian từ query (?range=7d|30d|90d|month|quarter|custom&from=YYYY-MM-DD&to=YYYY-MM-DD). */
export function rangeFromQuery(sp: URLSearchParams | Record<string, string | undefined>): RangeInput {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : sp[k]) ?? null;
  return { preset: get("range"), from: get("from"), to: get("to") };
}
