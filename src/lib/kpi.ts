import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { wonLost } from "./metrics";
import { notifyOnce, userIdByName } from "./notify";
import { listTeams } from "./perf/teams";

// ======================= Phần thuần (có kiểm thử) =======================

export const METRICS = ["revenue", "won_deals", "new_contacts", "calls", "win_rate", "tickets_resolved"] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = {
  revenue: "Doanh thu",
  won_deals: "Giao dịch thắng",
  new_contacts: "Khách mới",
  calls: "Cuộc gọi",
  win_rate: "Tỉ lệ chốt",
  tickets_resolved: "Phiếu hỗ trợ đã xử lý",
};
export const METRIC_UNIT: Record<Metric, "vnd" | "count" | "pct"> = { revenue: "vnd", won_deals: "count", new_contacts: "count", calls: "count", win_rate: "pct", tickets_resolved: "count" };
/** Chỉ số dạng tỉ lệ: không cộng dồn theo ngày nên nhịp kỳ vọng = chỉ tiêu. */
export const isRate = (m: Metric) => m === "win_rate";
export const isMetric = (s: string): s is Metric => (METRICS as readonly string[]).includes(s);

export type KpiStatus = "ahead" | "on" | "behind" | "none";
export const STATUS_LABEL: Record<KpiStatus, string> = { ahead: "Vượt", on: "Đúng nhịp", behind: "Đang chậm", none: "Chưa đặt" };

// Giờ Việt Nam cố định UTC+7, không có giờ mùa hè.
const VN = 7 * 3600e3;

/** Kỳ "YYYY-MM" hợp lệ không. */
export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** Kỳ hiện tại theo giờ Việt Nam. */
export function currentPeriod(now = new Date()) {
  return new Date(now.getTime() + VN).toISOString().slice(0, 7);
}

/** Kỳ liền trước ("2026-01" → "2025-12"). */
export function prevPeriod(p: string) {
  const [y, m] = p.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Khoảng thời gian [đầu tháng, đầu tháng sau) theo giờ Việt Nam. */
export function monthRange(p: string) {
  const [y, m] = p.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - VN), to: new Date(Date.UTC(y, m, 1) - VN) };
}

export const daysIn = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Đã đi được bao nhiêu ngày của kỳ: tháng đã qua = đủ tháng, tháng tương lai = 0. */
export function dayOfPeriod(p: string, now = new Date()) {
  const cur = currentPeriod(now);
  if (p < cur) return daysIn(p);
  if (p > cur) return 0;
  return new Date(now.getTime() + VN).getUTCDate();
}

/** Mức kỳ vọng tới hôm nay = chỉ tiêu × ngày đã qua / số ngày trong tháng (tỉ lệ thì giữ nguyên chỉ tiêu). */
export function expectedPace(target: number, day: number, days: number, rate = false) {
  if (!(target > 0) || days <= 0) return 0;
  if (rate) return target;
  return (target * Math.max(0, Math.min(day, days))) / days;
}

/** Phần trăm hoàn thành chỉ tiêu (0 khi chưa đặt). */
export const progressPct = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0);

/**
 * Trạng thái so với nhịp: Vượt khi ≥ 110% mức kỳ vọng, Đúng nhịp khi ≥ 90%, còn lại Đang chậm.
 * Chưa đặt chỉ tiêu hoặc kỳ chưa bắt đầu thì "none".
 */
export function paceStatus(actual: number, target: number, day: number, days: number, rate = false): KpiStatus {
  if (!(target > 0)) return "none";
  const exp = expectedPace(target, day, days, rate);
  if (exp <= 0) return "none";
  const r = actual / exp;
  return r >= 1.1 ? "ahead" : r >= 0.9 ? "on" : "behind";
}

/** Chậm bao nhiêu phần so với nhịp (0.25 = chậm 25%). Âm hoặc 0 nghĩa là không chậm. */
export function behindBy(actual: number, target: number, day: number, days: number, rate = false) {
  const exp = expectedPace(target, day, days, rate);
  return exp > 0 ? 1 - actual / exp : 0;
}

/** Tỉ lệ chốt (%) = thắng / (thắng + thua), làm tròn 1 chữ số. */
export function winRate(won: number, lost: number) {
  const n = won + lost;
  return n > 0 ? Math.round((won / n) * 1000) / 10 : 0;
}

/** Danh sách người tính KPI: đội trong cấu hình + tên thành viên, bỏ trùng và rỗng. */
export function teamOf(cfg: { team: string[] }, memberNames: string[]) {
  return [...new Set([...cfg.team, ...memberNames].map((s) => s.trim()).filter(Boolean))];
}

/** Mã tuần ISO "2026-W45" theo giờ Việt Nam, dùng để chống gửi trùng. */
export function weekKey(now = new Date()) {
  const d = new Date(now.getTime() + VN);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

export const isMondayVN = (now = new Date()) => new Date(now.getTime() + VN).getUTCDay() === 1;

// ----------------------- Kỳ xem: tháng / quý / năm -----------------------

export type PeriodView = "month" | "quarter" | "year";
export const PERIOD_VIEWS: PeriodView[] = ["month", "quarter", "year"];
export const isPeriodView = (s: string | null | undefined): s is PeriodView => s === "month" || s === "quarter" || s === "year";

/** Các tháng thuộc kỳ xem chứa tháng p: tháng = [p], quý = 3 tháng của quý, năm = 12 tháng. */
export function viewMonths(view: PeriodView, p: string): string[] {
  const [y, m] = p.split("-").map(Number);
  const pad = (n: number) => `${y}-${String(n).padStart(2, "0")}`;
  if (view === "year") return Array.from({ length: 12 }, (_, i) => pad(i + 1));
  if (view === "quarter") {
    const q0 = Math.floor((m - 1) / 3) * 3;
    return [pad(q0 + 1), pad(q0 + 2), pad(q0 + 3)];
  }
  return [p];
}

/** Khoảng thời gian [đầu tháng đầu, đầu tháng sau tháng cuối) của kỳ xem. */
export function viewRange(view: PeriodView, p: string) {
  const ms = viewMonths(view, p);
  return { from: monthRange(ms[0]).from, to: monthRange(ms[ms.length - 1]).to };
}

/** Số ngày đã qua / tổng số ngày của kỳ xem (cộng theo từng tháng). */
export function viewDays(view: PeriodView, p: string, now = new Date()) {
  const ms = viewMonths(view, p);
  return { day: ms.reduce((s, x) => s + dayOfPeriod(x, now), 0), days: ms.reduce((s, x) => s + daysIn(x), 0) };
}

export function viewLabel(view: PeriodView, p: string) {
  const [y, m] = p.split("-").map(Number);
  if (view === "year") return `Năm ${y}`;
  if (view === "quarter") return `Quý ${Math.floor((m - 1) / 3) + 1}/${y}`;
  return `Tháng ${m}/${y}`;
}

/**
 * Gộp chỉ tiêu nhiều tháng: chỉ số đếm/tiền cộng dồn; tỉ lệ (tỉ lệ chốt) lấy trung bình các tháng có đặt.
 */
export function sumTargets(list: Targets[]): Targets {
  const out: Targets = {};
  const rateN: Record<string, number> = {};
  for (const t of list)
    for (const [who, cells] of Object.entries(t))
      for (const m of METRICS) {
        const v = cells[m];
        if (!(typeof v === "number" && v > 0)) continue;
        const o = (out[who] ??= {});
        o[m] = (o[m] ?? 0) + v;
        if (isRate(m)) rateN[who] = (rateN[who] ?? 0) + 1;
      }
  for (const [who, n] of Object.entries(rateN)) if (out[who]?.win_rate) out[who].win_rate = Math.round((out[who].win_rate! / n) * 10) / 10;
  return out;
}

// ----------------------- KPI theo đội -----------------------

/** Khoá chỉ tiêu của một đội trong bảng KpiTarget: who = "team:<teamId>". */
export const TEAM_PREFIX = "team:";
export const teamKey = (teamId: string) => `${TEAM_PREFIX}${teamId}`;
export const isTeamKey = (who: string) => who.startsWith(TEAM_PREFIX);

/**
 * Thực tế của một đội = tổng của thành viên (bỏ trùng tên). Tỉ lệ chốt tính lại từ tổng thắng / (tổng thắng + tổng thua),
 * không lấy trung bình tỉ lệ từng người.
 */
export function sumActuals(members: string[], actuals: Actuals, lost: Record<string, number>): Record<Metric, number> {
  const out = zero();
  let lostSum = 0;
  for (const who of new Set(members.filter(Boolean))) {
    const a = actuals[who];
    if (a) for (const m of METRICS) if (!isRate(m)) out[m] += a[m];
    lostSum += lost[who] ?? 0;
  }
  out.win_rate = winRate(out.won_deals, lostSum);
  return out;
}

/**
 * Chỉ tiêu của đội: ô đặt riêng cho đội được ưu tiên; ô chưa đặt thì lấy tổng chỉ tiêu của thành viên
 * (tỉ lệ thì trung bình). Trả kèm danh sách chỉ số đang dùng chỉ tiêu cộng từ thành viên.
 */
export function teamTargets(explicit: Partial<Record<Metric, number>> | undefined, members: string[], targets: Targets) {
  const fromMembers = sumTargets([...new Set(members)].map((w) => ({ x: targets[w] ?? {} })))["x"] ?? {};
  const out: Partial<Record<Metric, number>> = {};
  const derived: Metric[] = [];
  for (const m of METRICS) {
    const e = explicit?.[m];
    if (e && e > 0) out[m] = e;
    else if (fromMembers[m]) {
      out[m] = fromMembers[m];
      derived.push(m);
    }
  }
  return { targets: out, derived };
}

/**
 * Người được tính doanh thu của một đơn: người phụ trách giao dịch gắn với đơn, rồi người phụ trách khách,
 * rồi người tạo đơn, cuối cùng người lập phiếu thu. (Chủ/kế toán hay tạo đơn hộ nhân viên bán.)
 */
export function revenueOwner(o: { dealOwner?: string | null; contactOwner?: string | null; orderCreatedBy?: string | null; paymentCreatedBy?: string | null }) {
  return (o.dealOwner || o.contactOwner || o.orderCreatedBy || o.paymentCreatedBy || "").trim();
}

// ======================= Tính số liệu thực tế =======================

export type Actuals = Record<string, Record<Metric, number>>;
const zero = (): Record<Metric, number> => ({ revenue: 0, won_deals: 0, new_contacts: 0, calls: 0, win_rate: 0, tickets_resolved: 0 });

/** Người phụ trách của các giao dịch / khách gắn với đơn (một truy vấn), dùng cho revenueOwner. */
export async function ownersOf(workspaceId: string, ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = uniq.length ? await db.record.findMany({ where: { workspaceId, id: { in: uniq } }, select: { id: true, objectKey: true, ownerName: true } }) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Số liệu thực tế của kỳ, theo từng người và cả công ty (khoá "").
 * - Doanh thu: nếu workspace đã có phiếu thu (Payment) thì cộng Payment.amount theo paidAt trong tháng,
 *   gán theo revenueOwner: người phụ trách giao dịch gắn đơn → người phụ trách khách → người tạo đơn → người lập phiếu.
 *   Chưa có phiếu thu nào thì cộng giá trị giao dịch chuyển sang trạng thái thắng trong tháng.
 * - Thời điểm thắng/thua: lấy hoạt động hệ thống "đổi … sang “<trạng thái>”" mới nhất của giao dịch;
 *   không có thì dùng updatedAt (gần đúng, chấp nhận được).
 * - Giao dịch, khách mới: theo ownerName. Cuộc gọi: Call.agentName theo startedAt. Phiếu hỗ trợ: Ticket.assignee theo resolvedAt.
 */
export async function computeActuals(workspaceId: string, cfg: WorkspaceConfig, period: string): Promise<{ actuals: Actuals; lost: Record<string, number>; revenueSource: "payments" | "deals" }> {
  const { from, to } = monthRange(period);
  return computeActualsRange(workspaceId, cfg, from, to);
}

/** Như computeActuals nhưng cho khoảng thời gian bất kỳ (quý, năm). lost = số giao dịch thua theo người. */
export async function computeActualsRange(workspaceId: string, cfg: WorkspaceConfig, from: Date, to: Date): Promise<{ actuals: Actuals; lost: Record<string, number>; revenueSource: "payments" | "deals" }> {
  const out: Actuals = { "": zero() };
  const add = (who: string, m: Metric, v: number) => {
    for (const k of who ? [who, ""] : [""]) (out[k] ??= zero())[m] += v;
  };

  // Giao dịch thắng/thua trong tháng.
  const deals = getObject(cfg, "deals");
  const { won, lost } = wonLost(cfg);
  const closedKeys = [...won, ...lost];
  const wonAmount: { who: string; amount: number }[] = [];
  const lostCount: Record<string, number> = {};
  if (deals && closedKeys.length) {
    // Lấy cả mục cập nhật sau đầu tháng: mục thắng trong tháng chắc chắn có updatedAt ≥ from.
    const rows = await db.record.findMany({ where: { workspaceId, objectKey: "deals", status: { in: closedKeys }, updatedAt: { gte: from } }, select: { id: true, status: true, ownerName: true, amount: true, updatedAt: true } });
    const acts = rows.length
      ? await db.activity.findMany({ where: { recordId: { in: rows.map((r) => r.id) }, kind: "system", body: { contains: " sang “" } }, select: { recordId: true, body: true, createdAt: true }, orderBy: { createdAt: "desc" } })
      : [];
    for (const r of rows) {
      const label = deals.statuses.find((s) => s.key === r.status)?.label ?? r.status;
      const act = acts.find((a) => a.recordId === r.id && a.body.endsWith(`sang “${label}”`));
      const at = act?.createdAt ?? r.updatedAt;
      if (at < from || at >= to) continue;
      if (won.has(r.status)) {
        add(r.ownerName, "won_deals", 1);
        wonAmount.push({ who: r.ownerName, amount: r.amount });
      } else {
        for (const k of r.ownerName ? [r.ownerName, ""] : [""]) lostCount[k] = (lostCount[k] ?? 0) + 1;
      }
    }
  }
  for (const who of Object.keys(lostCount)) out[who] ??= zero();

  // Doanh thu.
  const anyPayment = await db.payment.findFirst({ where: { workspaceId }, select: { id: true } });
  if (anyPayment) {
    const pays = await db.payment.findMany({ where: { workspaceId, paidAt: { gte: from, lt: to } }, select: { amount: true, createdBy: true, order: { select: { createdBy: true, recordId: true, contactId: true } } } });
    const owners = await ownersOf(workspaceId, pays.flatMap((p) => [p.order?.recordId, p.order?.contactId]));
    for (const p of pays) {
      const deal = p.order?.recordId ? owners.get(p.order.recordId) : undefined;
      const contact = p.order?.contactId ? owners.get(p.order.contactId) : undefined;
      add(revenueOwner({ dealOwner: deal?.objectKey === "deals" ? deal.ownerName : "", contactOwner: contact?.ownerName, orderCreatedBy: p.order?.createdBy, paymentCreatedBy: p.createdBy }), "revenue", p.amount);
    }
  } else {
    for (const d of wonAmount) add(d.who, "revenue", d.amount);
  }

  // Khách mới.
  const contacts = await db.record.groupBy({ by: ["ownerName"], where: { workspaceId, objectKey: "contacts", createdAt: { gte: from, lt: to } }, _count: true });
  for (const c of contacts) add(c.ownerName, "new_contacts", c._count);

  // Cuộc gọi.
  const calls = await db.call.groupBy({ by: ["agentName"], where: { workspaceId, startedAt: { gte: from, lt: to } }, _count: true });
  for (const c of calls) add(c.agentName, "calls", c._count);

  // Phiếu hỗ trợ đã xử lý.
  const tickets = await db.ticket.groupBy({ by: ["assignee"], where: { workspaceId, resolvedAt: { gte: from, lt: to } }, _count: true });
  for (const t of tickets) add(t.assignee, "tickets_resolved", t._count);

  // Tỉ lệ chốt tính sau cùng, khi đã đủ số thắng/thua.
  for (const [who, v] of Object.entries(out)) v.win_rate = winRate(v.won_deals, lostCount[who] ?? 0);

  return { actuals: out, lost: lostCount, revenueSource: anyPayment ? "payments" : "deals" };
}

export type Targets = Record<string, Partial<Record<Metric, number>>>;

export async function getTargets(workspaceId: string, period: string): Promise<Targets> {
  const rows = await db.kpiTarget.findMany({ where: { workspaceId, period } });
  const out: Targets = {};
  for (const r of rows) if (isMetric(r.metric)) (out[r.who] ??= {})[r.metric] = r.target;
  return out;
}

/** Ghi chỉ tiêu: target ≤ 0 hoặc null nghĩa là xoá ô đó. */
export async function setTargets(workspaceId: string, period: string, cells: { who: string; metric: Metric; target: number | null }[]) {
  for (const c of cells) {
    const where = { workspaceId_period_who_metric: { workspaceId, period, who: c.who, metric: c.metric } };
    if (c.target === null || !(c.target > 0)) await db.kpiTarget.deleteMany({ where: { workspaceId, period, who: c.who, metric: c.metric } });
    else await db.kpiTarget.upsert({ where, create: { workspaceId, period, who: c.who, metric: c.metric, target: c.target }, update: { target: c.target } });
  }
}

/** Chép chỉ tiêu tháng trước sang tháng này (chỉ điền ô còn trống). Trả về số ô đã chép. */
export async function copyTargets(workspaceId: string, period: string) {
  const prev = await db.kpiTarget.findMany({ where: { workspaceId, period: prevPeriod(period) } });
  const have = new Set((await db.kpiTarget.findMany({ where: { workspaceId, period }, select: { who: true, metric: true } })).map((r) => `${r.who}|${r.metric}`));
  const todo = prev.filter((r) => !have.has(`${r.who}|${r.metric}`));
  for (const r of todo) await db.kpiTarget.create({ data: { workspaceId, period, who: r.who, metric: r.metric, target: r.target } });
  return todo.length;
}

export type KpiRow = { who: string; cells: Record<Metric, { actual: number; target: number; pct: number; expected: number; status: KpiStatus }> };

/** Một hàng của bảng KPI từ thực tế + chỉ tiêu của một người (hoặc một đội). */
export function rowFor(who: string, a: Record<Metric, number> | undefined, t: Partial<Record<Metric, number>> | undefined, day: number, days: number): KpiRow {
  const act = a ?? zero();
  const tg = t ?? {};
  const cells = {} as KpiRow["cells"];
  for (const m of METRICS) {
    const target = tg[m] ?? 0;
    cells[m] = { actual: act[m], target, pct: progressPct(act[m], target), expected: expectedPace(target, day, days, isRate(m)), status: paceStatus(act[m], target, day, days, isRate(m)) };
  }
  return { who, cells };
}

/** Ghép thực tế + chỉ tiêu thành bảng. Hàng "" = cả công ty, đứng đầu. */
export function buildRows(people: string[], actuals: Actuals, targets: Targets, day: number, days: number): KpiRow[] {
  return ["", ...people].map((who) => rowFor(who, actuals[who], targets[who], day, days));
}

/** Điểm xếp hạng: trung bình % hoàn thành các chỉ tiêu đã đặt (trần 200%). Chưa đặt chỉ tiêu nào thì theo doanh thu. */
export function leaderScore(row: KpiRow) {
  const set = METRICS.filter((m) => row.cells[m].target > 0);
  if (!set.length) return -1;
  return Math.round(set.reduce((s, m) => s + Math.min(200, row.cells[m].pct), 0) / set.length);
}

export async function memberNames(workspaceId: string) {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { user: { select: { name: true } } } });
  return ms.map((m) => m.user.name);
}

export type TeamKpi = {
  id: string;
  name: string;
  color: string;
  leader: string;
  members: string[];
  /** Hàng KPI của đội, who = "team:<id>". */
  row: KpiRow;
  /** Chỉ tiêu đặt riêng cho đội (ô trống thì đang dùng tổng chỉ tiêu thành viên). */
  explicit: Partial<Record<Metric, number>>;
  derived: Metric[];
  memberRows: KpiRow[];
  score: number;
};

/** Chỉ tiêu của nhiều tháng (gộp theo sumTargets). */
export async function getTargetsFor(workspaceId: string, periods: string[]): Promise<Targets> {
  if (periods.length === 1) return getTargets(workspaceId, periods[0]);
  return sumTargets(await Promise.all(periods.map((p) => getTargets(workspaceId, p))));
}

/** Bảng KPI theo đội: thực tế = tổng thành viên, chỉ tiêu = ô riêng của đội hoặc tổng thành viên. */
export function buildTeamRows(teams: { id: string; name: string; color: string; leader: string; members: string[] }[], actuals: Actuals, lost: Record<string, number>, targets: Targets, day: number, days: number): TeamKpi[] {
  return teams
    .map((t) => {
      const members = [...new Set([...(t.leader ? [t.leader] : []), ...t.members].filter(Boolean))];
      const explicit = targets[teamKey(t.id)] ?? {};
      const tt = teamTargets(explicit, members, targets);
      const row = rowFor(teamKey(t.id), sumActuals(members, actuals, lost), tt.targets, day, days);
      const memberRows = members.map((w) => rowFor(w, actuals[w], targets[w], day, days)).sort((a, b) => leaderScore(b) - leaderScore(a) || b.cells.revenue.actual - a.cells.revenue.actual);
      return { id: t.id, name: t.name, color: t.color, leader: t.leader, members, row, explicit, derived: tt.derived, memberRows, score: leaderScore(row) };
    })
    .sort((a, b) => b.score - a.score || b.row.cells.revenue.actual - a.row.cells.revenue.actual);
}

/** Toàn bộ dữ liệu cho trang KPI. view = "quarter"/"year" gộp các tháng của quý/năm chứa period. */
export async function kpiBoard(workspaceId: string, cfg: WorkspaceConfig, period: string, now = new Date(), view: PeriodView = "month") {
  const people = teamOf(cfg, await memberNames(workspaceId));
  const { from, to } = viewRange(view, period);
  const [{ actuals, lost, revenueSource }, targets, teams] = await Promise.all([computeActualsRange(workspaceId, cfg, from, to), getTargetsFor(workspaceId, viewMonths(view, period)), listTeams(workspaceId)]);
  const { day, days } = viewDays(view, period, now);
  const rows = buildRows(people, actuals, targets, day, days);
  const teamRows = buildTeamRows(teams, actuals, lost, targets, day, days);
  return { period, view, label: viewLabel(view, period), day, days, people, rows, teams: teamRows, revenueSource };
}

// ======================= Job nhắc hàng tuần =======================

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Job (đăng ký mỗi 60 phút, chỉ làm việc vào thứ Hai giờ VN): báo từng người đang chậm nhịp quá 20%
 * ở chỉ tiêu nào, và gửi chủ/quản lý bảng tóm tắt. Chống trùng bằng notifyOnce với mã tuần trong nội dung.
 */
export async function tickKpi(now = new Date()): Promise<void> {
  if (!isMondayVN(now)) return;
  const period = currentPeriod(now);
  const day = dayOfPeriod(period, now);
  // Đầu tháng số liệu còn ít, chưa nhắc.
  if (day < 3) return;
  const wk = weekKey(now);
  const wsIds = (await db.kpiTarget.groupBy({ by: ["workspaceId"], where: { period } })).map((r) => r.workspaceId);
  for (const wid of wsIds) {
    const cfgRow = await db.workspaceConfig.findFirst({ where: { workspaceId: wid, isActive: true } });
    const cfg = cfgRow ? parseJson<WorkspaceConfig | null>(cfgRow.configJson, null) : null;
    if (!cfg) continue;
    const board = await kpiBoard(wid, cfg, period, now);
    const lines: string[] = [];
    for (const row of board.rows) {
      if (!row.who) continue;
      const slow = METRICS.filter((m) => row.cells[m].target > 0 && behindBy(row.cells[m].actual, row.cells[m].target, day, board.days, isRate(m)) > 0.2);
      if (!slow.length) continue;
      const detail = slow.map((m) => `${METRIC_LABEL[m]} ${row.cells[m].pct}% (nhịp cần ${fmtPct(row.cells[m].expected / row.cells[m].target)})`).join(", ");
      lines.push(`${row.who}: ${slow.map((m) => METRIC_LABEL[m].toLowerCase()).join(", ")}`);
      const userId = await userIdByName(wid, row.who);
      if (userId) await notifyOnce(wid, { userId, kind: "kpi", text: `KPI tuần ${wk}: bạn đang chậm nhịp — ${detail}`, href: `/w/kpi?period=${period}` });
    }
    const managers = await db.membership.findMany({ where: { workspaceId: wid, role: { in: ["owner", "manager"] } }, select: { userId: true } });
    const text = lines.length ? `KPI tuần ${wk}: ${lines.length} người chậm nhịp quá 20% — ${lines.join("; ")}` : `KPI tuần ${wk}: cả đội đang theo kịp nhịp chỉ tiêu tháng ${period}.`;
    for (const m of managers) await notifyOnce(wid, { userId: m.userId, kind: "kpi", text, href: `/w/kpi?period=${period}` });
  }
}
