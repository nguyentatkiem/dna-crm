import type { Prisma } from "@prisma/client";
import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { wonLost } from "./metrics";
import { recordScope } from "./permissions";
import { COLORS } from "./colors";
import { CHANNELS } from "./sources/ingest";
import { PALETTE, type Fmt, type KpiKey, type RangeKey, type Widget, type WidgetConfig, type WidgetData, type WidgetType } from "@/app/w/dashboards/catalog";

export * from "@/app/w/dashboards/catalog";

type Viewer = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };
type Rec = { id: string; objectKey: string; title: string; status: string; ownerName: string; amount: number; score: number; createdAt: Date; updatedAt: Date; data: Record<string, unknown> };

const DAY = 864e5;

/** Khoảng thời gian [from, to) và kỳ trước cùng độ dài để so sánh. */
export function rangeOf(r: RangeKey | undefined, now = new Date()): { from: Date; to: Date; prevFrom: Date; prevTo: Date } | null {
  const to = now;
  if (!r || r === "all") return null;
  let from: Date;
  let prevFrom: Date;
  if (r === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  } else if (r === "quarter") {
    const q = Math.floor(now.getMonth() / 3) * 3;
    from = new Date(now.getFullYear(), q, 1);
    prevFrom = new Date(now.getFullYear(), q - 3, 1);
  } else {
    const days = r === "7d" ? 7 : r === "30d" ? 30 : 90;
    from = new Date(now.getTime() - days * DAY);
    prevFrom = new Date(from.getTime() - days * DAY);
  }
  // Kỳ trước: cùng số ngày đã trôi qua tính từ đầu kỳ trước (so sánh công bằng giữa tháng).
  const prevTo = new Date(Math.min(from.getTime(), prevFrom.getTime() + (to.getTime() - from.getTime())));
  return { from, to, prevFrom, prevTo };
}

const inR = (d: Date, a: Date, b: Date) => d >= a && d < b;
const str = (v: unknown) => (v == null ? "" : String(v));

/** Bộ nạp dữ liệu dùng chung cho mọi widget trong một lần xem (mỗi bảng chỉ truy vấn một lần). */
export function createLoader(viewer: Viewer, cfg: WorkspaceConfig) {
  const wid = viewer.workspace.id;
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>) => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as Promise<T>;
  };
  const scope = () => once("scope", () => recordScope(viewer));
  const restricted = async () => "OR" in (await scope());
  const records = () =>
    once("records", async () => {
      const rows = await db.record.findMany({
        where: await scope(),
        select: { id: true, objectKey: true, title: true, status: true, ownerName: true, amount: true, score: true, createdAt: true, updatedAt: true, dataJson: true },
      });
      return rows.map(({ dataJson, ...r }): Rec => ({ ...r, data: parseJson<Record<string, unknown>>(dataJson, {}) }));
    });
  const calls = () =>
    once("calls", async () => {
      const where: Prisma.CallWhereInput = { workspaceId: wid, startedAt: { gte: new Date(Date.now() - 400 * DAY) } };
      if (await restricted()) where.agentName = viewer.user.name;
      return db.call.findMany({ where, select: { id: true, agentName: true, aiScore: true, reviewScore: true, outcome: true, startedAt: true, recordId: true } });
    });
  const spends = () =>
    once("spend", () => db.adSpend.findMany({ where: { workspaceId: wid, date: { gte: new Date(Date.now() - 400 * DAY) } }, select: { date: true, spend: true, leads: true } }));
  return { wid, cfg, viewer, records, calls, spends, restricted, scope };
}
export type Loader = ReturnType<typeof createLoader>;

function filterRecords(list: Rec[], c: WidgetConfig) {
  return list.filter((r) => (!c.owner || r.ownerName === c.owner) && (!c.channel || str(r.data._kenh) === c.channel));
}

const KPI_FMT: Record<KpiKey, Fmt> = {
  won_revenue: "money",
  pipeline_value: "money",
  new_contacts: "number",
  win_rate: "percent",
  calls: "number",
  avg_call_score: "score",
  ad_spend: "money",
  roas: "ratio",
  unread: "number",
};

/** Giá trị một chỉ số trong khoảng [a, b). a = null nghĩa là toàn bộ. */
async function metricValue(L: Loader, metric: KpiKey, c: WidgetConfig, a: Date | null, b: Date): Promise<{ value: number; hint: string }> {
  const { won, lost } = wonLost(L.cfg);
  const within = (d: Date) => (a ? inR(d, a, b) : d < b);
  if (metric === "calls" || metric === "avg_call_score") {
    const list = (await L.calls()).filter((x) => within(x.startedAt) && (!c.owner || x.agentName === c.owner));
    if (metric === "calls") return { value: list.length, hint: `${list.filter((x) => x.outcome === "won" || x.outcome === "appointment").length} cuộc hẹn/chốt` };
    const scored = list.map((x) => x.reviewScore ?? x.aiScore).filter((x): x is number => x != null);
    return { value: scored.length ? scored.reduce((s, x) => s + x, 0) / scored.length : 0, hint: `trên ${scored.length} cuộc đã chấm` };
  }
  if (metric === "ad_spend") {
    const list = (await L.spends()).filter((x) => within(x.date));
    return { value: list.reduce((s, x) => s + x.spend, 0), hint: `${list.reduce((s, x) => s + x.leads, 0)} lead từ quảng cáo` };
  }
  if (metric === "unread") {
    const where: Prisma.ConversationWhereInput = { workspaceId: L.wid, unread: { gt: 0 } };
    if (await L.restricted()) where.assignee = { in: [L.viewer.user.name, ""] };
    if (a) where.lastAt = { gte: a, lt: b };
    const rows = await db.conversation.findMany({ where, select: { unread: true } });
    return { value: rows.reduce((s, x) => s + x.unread, 0), hint: `${rows.length} hội thoại đang chờ` };
  }
  const recs = filterRecords(await L.records(), c);
  const deals = recs.filter((r) => r.objectKey === "deals");
  if (metric === "won_revenue") {
    const list = deals.filter((d) => won.has(d.status) && within(d.updatedAt));
    return { value: list.reduce((s, d) => s + d.amount, 0), hint: `${list.length} mục đã chốt` };
  }
  if (metric === "pipeline_value") {
    const list = deals.filter((d) => !won.has(d.status) && !lost.has(d.status) && d.createdAt < b);
    return { value: list.reduce((s, d) => s + d.amount, 0), hint: `${list.length} mục đang mở` };
  }
  if (metric === "new_contacts") {
    const list = recs.filter((r) => r.objectKey === "contacts" && within(r.createdAt));
    return { value: list.length, hint: `${list.filter((r) => r.score >= 70).length} khách nóng` };
  }
  if (metric === "win_rate") {
    const closed = deals.filter((d) => (won.has(d.status) || lost.has(d.status)) && within(d.updatedAt));
    const w = closed.filter((d) => won.has(d.status)).length;
    return { value: closed.length ? (w / closed.length) * 100 : 0, hint: `${w}/${closed.length} mục đã đóng` };
  }
  // ROAS = doanh thu chốt từ kênh quảng cáo / chi phí quảng cáo. Chưa gắn kênh cho giao dịch thì dùng toàn bộ doanh thu.
  const spend = (await L.spends()).filter((x) => within(x.date)).reduce((s, x) => s + x.spend, 0);
  const wonList = deals.filter((d) => won.has(d.status) && within(d.updatedAt));
  const attributed = deals.some((d) => d.data._kenh);
  const revenue = (attributed ? wonList.filter((d) => d.data._kenh === "ads") : wonList).reduce((s, d) => s + d.amount, 0);
  return { value: spend ? revenue / spend : 0, hint: spend ? `${attributed ? "doanh thu từ QC" : "toàn bộ doanh thu"} / chi phí QC` : "chưa có chi phí quảng cáo" };
}

const dkey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dlabel = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

async function series(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const s = c.series ?? "new_contacts_daily";
  const weekly = s === "revenue_weekly";
  const r = rangeOf(c.range === "all" || !c.range ? (weekly ? "90d" : "30d") : c.range)!;
  const buckets: { key: string; label: string; start: Date; value: number }[] = [];
  if (weekly) {
    // Tuần bắt đầu thứ Hai.
    const first = startOfDay(r.from);
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    for (let d = first; d < r.to; d = new Date(d.getTime() + 7 * DAY)) buckets.push({ key: dkey(d), label: dlabel(d), start: d, value: 0 });
  } else {
    for (let d = startOfDay(r.from); d < r.to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) buckets.push({ key: dkey(d), label: dlabel(d), start: d, value: 0 });
  }
  const add = (d: Date, v: number) => {
    if (d < r.from || d >= r.to) return;
    let b = buckets[0];
    for (const x of buckets) if (x.start <= d) b = x;
    if (b) b.value += v;
  };
  let format: Fmt = "number";
  if (s === "new_contacts_daily") filterRecords(await L.records(), c).filter((x) => x.objectKey === "contacts").forEach((x) => add(x.createdAt, 1));
  else if (s === "calls_daily") (await L.calls()).filter((x) => !c.owner || x.agentName === c.owner).forEach((x) => add(x.startedAt, 1));
  else if (s === "ad_spend_daily") {
    format = "money";
    (await L.spends()).forEach((x) => add(x.date, x.spend));
  } else {
    format = "money";
    const { won } = wonLost(L.cfg);
    filterRecords(await L.records(), c).filter((x) => x.objectKey === "deals" && won.has(x.status)).forEach((x) => add(x.updatedAt, x.amount));
  }
  const points = buckets.map((b) => ({ label: b.label, value: Math.round(b.value) }));
  return { kind: "series", points, format, total: points.reduce((a, p) => a + p.value, 0) };
}

async function slices(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const objectKey = c.objectKey || "contacts";
  const obj = getObject(L.cfg, objectKey);
  const rg = rangeOf(c.range);
  const list = filterRecords(await L.records(), c).filter((r) => r.objectKey === objectKey && (!rg || inR(r.createdAt, rg.from, rg.to)));
  const measure = c.measure === "amount" ? "amount" : "count";
  const map = new Map<string, { value: number; color?: string }>();
  const bump = (name: string, r: Rec, color?: string) => {
    const e = map.get(name) ?? { value: 0, color };
    e.value += measure === "amount" ? r.amount : 1;
    map.set(name, e);
  };
  const by = c.groupBy ?? "status";
  for (const r of list) {
    if (by === "status") {
      const st = obj?.statuses.find((s) => s.key === r.status);
      bump(st?.label ?? r.status, r, st ? COLORS[st.color]?.bg : undefined);
    } else if (by === "source") bump(str(r.data._nguon) || str(r.data.nguon) || "Nhập tay", r);
    else if (by === "channel") bump(CHANNELS[str(r.data._kenh) as keyof typeof CHANNELS] ?? "Nhập tay", r);
    else bump(r.ownerName || "Chưa giao", r);
  }
  let i = 0;
  const out = [...map.entries()]
    .map(([name, v]) => ({ name, value: v.value, color: v.color ?? "" }))
    .sort((a, b) => b.value - a.value)
    .map((x) => ({ ...x, color: x.color || PALETTE[i++ % PALETTE.length] }));
  // Gộp phần nhỏ thành "Khác" cho dễ đọc.
  const top = out.slice(0, 7);
  const rest = out.slice(7).reduce((s, x) => s + x.value, 0);
  if (rest) top.push({ name: "Khác", value: rest, color: "#c4c4c4" });
  return { kind: "slices", slices: top, format: measure === "amount" ? "money" : "number", total: out.reduce((s, x) => s + x.value, 0) };
}

async function funnel(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const obj = getObject(L.cfg, c.objectKey || "deals") ?? getObject(L.cfg, "deals");
  const { lost } = wonLost(L.cfg);
  const rg = rangeOf(c.range);
  const list = filterRecords(await L.records(), c).filter((r) => r.objectKey === obj?.key && (!rg || inR(r.createdAt, rg.from, rg.to)));
  const stages = (obj?.statuses ?? [])
    .filter((s) => obj?.key !== "deals" || !lost.has(s.key))
    .map((s) => {
      const items = list.filter((r) => r.status === s.key);
      return { name: s.label, count: items.length, amount: items.reduce((a, r) => a + r.amount, 0), color: COLORS[s.color]?.bg ?? PALETTE[0] };
    });
  return { kind: "funnel", stages };
}

async function leaderboard(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const rg = rangeOf(c.range);
  const limit = c.limit ?? 5;
  const by = c.rankBy ?? "revenue";
  const map = new Map<string, { value: number; n: number; extra: number }>();
  const put = (name: string, v: number, extra = 0) => {
    const e = map.get(name) ?? { value: 0, n: 0, extra: 0 };
    e.value += v;
    e.n++;
    e.extra += extra;
    map.set(name, e);
  };
  if (by === "revenue") {
    const { won } = wonLost(L.cfg);
    for (const d of filterRecords(await L.records(), c)) if (d.objectKey === "deals" && won.has(d.status) && d.ownerName && (!rg || inR(d.updatedAt, rg.from, rg.to))) put(d.ownerName, d.amount);
    const rows = [...map.entries()].map(([name, e]) => ({ name, value: e.value, sub: `${e.n} mục chốt` }));
    return { kind: "leaderboard", rows: rows.sort((a, b) => b.value - a.value).slice(0, limit), format: "money" };
  }
  for (const x of await L.calls()) {
    if (rg && !inR(x.startedAt, rg.from, rg.to)) continue;
    const sc = x.reviewScore ?? x.aiScore;
    if (by === "calls") put(x.agentName, 1, x.outcome === "won" || x.outcome === "appointment" ? 1 : 0);
    else if (sc != null) put(x.agentName, sc);
  }
  const rows = [...map.entries()].map(([name, e]) =>
    by === "calls" ? { name, value: e.value, sub: `${e.extra} hẹn/chốt` } : { name, value: e.n ? e.value / e.n : 0, sub: `${e.n} cuộc đã chấm` },
  );
  return { kind: "leaderboard", rows: rows.sort((a, b) => b.value - a.value).slice(0, limit), format: by === "calls" ? "number" : "score" };
}

async function table(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const objectKey = c.objectKey || "deals";
  const obj = getObject(L.cfg, objectKey);
  const rg = rangeOf(c.range);
  const sort = c.sort ?? (objectKey === "deals" ? "amount" : "score");
  const list = filterRecords(await L.records(), c)
    .filter((r) => r.objectKey === objectKey && (!rg || inR(r.createdAt, rg.from, rg.to)))
    .sort((a, b) => (sort === "createdAt" ? b.createdAt.getTime() - a.createdAt.getTime() : sort === "score" ? b.score - a.score : b.amount - a.amount))
    .slice(0, c.limit ?? 6);
  return {
    kind: "table",
    objectKey,
    amountLabel: obj?.amountLabel ?? "Giá trị",
    rows: list.map((r) => {
      const st = obj?.statuses.find((s) => s.key === r.status);
      return { id: r.id, title: r.title, status: st?.label ?? r.status, statusColor: COLORS[st?.color ?? "gray"]?.bg ?? "#c4c4c4", owner: r.ownerName, amount: r.amount, score: r.score, createdAt: r.createdAt.toISOString() };
    }),
  };
}

async function overdue(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const now = new Date();
  const where: Prisma.TaskWhereInput = { workspaceId: L.wid, done: false, dueAt: { lt: startOfDay(now) } };
  if (c.owner) where.assignee = c.owner;
  if (await L.restricted()) {
    const ids = (await L.records()).map((r) => r.id);
    where.OR = [{ assignee: L.viewer.user.name }, { recordId: { in: ids } }, { recordId: null, assignee: "" }];
  }
  const [rows, total] = await Promise.all([db.task.findMany({ where, orderBy: { dueAt: "asc" }, take: c.limit ?? 8 }), db.task.count({ where })]);
  return {
    kind: "tasks",
    total,
    items: rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt!.toISOString(), assignee: t.assignee, recordId: t.recordId, days: Math.max(1, Math.round((startOfDay(now).getTime() - startOfDay(t.dueAt!).getTime()) / DAY)) })),
  };
}

async function feed(L: Loader, c: WidgetConfig): Promise<WidgetData> {
  const recordWhere = await L.scope();
  const rows = await db.activity.findMany({
    where: { record: recordWhere },
    orderBy: { createdAt: "desc" },
    take: c.limit ?? 10,
    include: { record: { select: { title: true, objectKey: true } } },
  });
  return {
    kind: "feed",
    items: rows.map((a) => ({ id: a.id, body: a.body, author: a.author, at: a.createdAt.toISOString(), recordId: a.recordId, recordTitle: a.record.title, objectKey: a.record.objectKey, kind: a.kind })),
  };
}

/** Tính dữ liệu cho một widget. Không ném lỗi: lỗi trả về dạng { kind: "error" } để widget tự hiển thị. */
export async function computeWidget(L: Loader, type: WidgetType, c: WidgetConfig): Promise<WidgetData> {
  try {
    if (type === "kpi" || type === "goal") {
      const metric = c.metric ?? "won_revenue";
      const range = type === "goal" ? c.range ?? "month" : c.range ?? "30d";
      const rg = rangeOf(range);
      const now = new Date();
      const cur = await metricValue(L, metric, c, rg?.from ?? null, now);
      if (type === "goal") {
        const target = c.target ?? 0;
        const end = range === "month" ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : range === "quarter" ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1) : now;
        return { kind: "goal", value: cur.value, target, pct: target ? Math.round((cur.value / target) * 100) : 0, format: KPI_FMT[metric], daysLeft: Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY)) };
      }
      // Giá trị pipeline và tin chưa đọc là ảnh chụp hiện tại, không so kỳ trước.
      const snapshot = metric === "pipeline_value" || metric === "unread";
      const prev = rg && !snapshot ? await metricValue(L, metric, c, rg.prevFrom, rg.prevTo) : null;
      const delta = prev && prev.value ? ((cur.value - prev.value) / Math.abs(prev.value)) * 100 : null;
      return { kind: "kpi", value: cur.value, prev: prev?.value ?? null, delta: delta == null ? null : Math.round(delta), format: KPI_FMT[metric], hint: cur.hint };
    }
    if (type === "bar" || type === "line" || type === "area") return await series(L, c);
    if (type === "pie" || type === "donut") return await slices(L, c);
    if (type === "funnel") return await funnel(L, c);
    if (type === "leaderboard") return await leaderboard(L, c);
    if (type === "table") return await table(L, c);
    if (type === "overdue") return await overdue(L, c);
    if (type === "activity") return await feed(L, c);
    return { kind: "error", message: "Loại widget chưa hỗ trợ" };
  } catch (e) {
    console.error("[widget]", e instanceof Error ? e.message : e);
    return { kind: "error", message: "Không tính được dữ liệu" };
  }
}

/** Tính dữ liệu cho cả dashboard, trả map theo id widget. */
export async function computeDashboard(viewer: Viewer, cfg: WorkspaceConfig, widgets: Widget[]) {
  const L = createLoader(viewer, cfg);
  const entries = await Promise.all(widgets.map(async (w) => [w.id, await computeWidget(L, w.type, w.config)] as const));
  return Object.fromEntries(entries) as Record<string, WidgetData>;
}
