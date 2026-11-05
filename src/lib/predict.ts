// Dự báo khả năng chốt: hồi quy logistic tự viết khi đủ dữ liệu, mô hình tiên nghiệm theo giai đoạn khi chưa đủ.
import { db, parseJson } from "./db";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { wonLost } from "./metrics";
import { POSITIVE } from "./calls-shared";

export type Forecast = {
  pipeline: number;
  weighted: number;
  byMonth: { month: string; amount: number }[];
  deals: { id: string; title: string; amount: number; prob: number; ownerName: string }[];
  trainedOn: number;
};

// ───────────────────────── Phần thuần (có test) ─────────────────────────

export const MIN_TRAIN = 20;
export const FEATURES = ["stage", "ageDays", "idleDays", "activities", "logAmount", "channelRate", "positiveCalls", "contactScore"] as const;
export type FeatureRow = Record<(typeof FEATURES)[number], number>;
export type Model = { w: number[]; b: number; mean: number[]; std: number[] };

export const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

/** Tính trung bình và độ lệch chuẩn từng cột (độ lệch 0 đổi thành 1 để không chia cho 0). */
export function fitScaler(X: number[][]) {
  const d = X[0]?.length ?? 0;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / Math.max(X.length, 1));
  const std = mean.map((m, j) => {
    const v = X.reduce((s, r) => s + (r[j] - m) ** 2, 0) / Math.max(X.length, 1);
    return Math.sqrt(v) || 1;
  });
  return { mean, std };
}

export const scale = (x: number[], mean: number[], std: number[]) => x.map((v, j) => (v - mean[j]) / std[j]);

/** Gradient của hàm mất mát log-loss trung bình + L2 (không phạt hệ số chặn). */
export function gradient(Xs: number[][], y: number[], w: number[], b: number, l2: number) {
  const n = Xs.length;
  const gw = w.map(() => 0);
  let gb = 0;
  for (let i = 0; i < n; i++) {
    const err = sigmoid(Xs[i].reduce((s, v, j) => s + v * w[j], b)) - y[i];
    for (let j = 0; j < w.length; j++) gw[j] += (err * Xs[i][j]) / n;
    gb += err / n;
  }
  for (let j = 0; j < w.length; j++) gw[j] += l2 * w[j];
  return { gw, gb };
}

export function logLoss(Xs: number[][], y: number[], w: number[], b: number, l2 = 0) {
  const eps = 1e-12;
  let s = 0;
  for (let i = 0; i < Xs.length; i++) {
    const p = sigmoid(Xs[i].reduce((a, v, j) => a + v * w[j], b));
    s += -(y[i] * Math.log(p + eps) + (1 - y[i]) * Math.log(1 - p + eps));
  }
  return s / Math.max(Xs.length, 1) + (l2 / 2) * w.reduce((a, v) => a + v * v, 0);
}

/** Huấn luyện hồi quy logistic: chuẩn hoá đặc trưng rồi gradient descent có L2. */
export function trainLogistic(X: number[][], y: number[], opts: { lr?: number; epochs?: number; l2?: number } = {}): Model {
  const { lr = 0.3, epochs = 600, l2 = 0.05 } = opts;
  const { mean, std } = fitScaler(X);
  const Xs = X.map((r) => scale(r, mean, std));
  let w = (X[0] ?? []).map(() => 0);
  // Hệ số chặn khởi đầu bằng log-odds của tỉ lệ thắng để hội tụ nhanh hơn.
  const rate = Math.min(0.99, Math.max(0.01, y.reduce((s, v) => s + v, 0) / Math.max(y.length, 1)));
  let b = Math.log(rate / (1 - rate));
  for (let e = 0; e < epochs; e++) {
    const { gw, gb } = gradient(Xs, y, w, b, l2);
    w = w.map((v, j) => v - lr * gw[j]);
    b -= lr * gb;
  }
  return { w, b, mean, std };
}

export const predictProba = (m: Model, x: number[]) => sigmoid(scale(x, m.mean, m.std).reduce((s, v, j) => s + v * m.w[j], m.b));

/**
 * Mô hình tiên nghiệm khi chưa đủ dữ liệu: giai đoạn càng gần thắng càng cao (10% → 85%),
 * không cập nhật quá 14 ngày thì giảm dần (tối đa còn 40%). Có tỉ lệ thắng lịch sử thì kéo nhẹ về đó.
 */
export function priorProb(stage: number, idleDays: number, baseRate?: number) {
  let p = 0.1 + 0.75 * Math.min(1, Math.max(0, stage));
  if (idleDays > 14) p *= Math.max(0.4, 1 - (idleDays - 14) / 60);
  if (baseRate !== undefined) p = 0.75 * p + 0.25 * baseRate;
  return Math.min(0.97, Math.max(0.02, p));
}

/** Đổi tỉ lệ thắng theo kênh có làm mượt (để kênh ít dữ liệu không bị cực đoan). */
export function smoothedRate(wins: number, total: number, base: number, k = 3) {
  return (wins + k * base) / (total + k);
}

export const toPercent = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100);

export const rowToVector = (r: FeatureRow) => FEATURES.map((f) => r[f]);

// ───────────────────────── Phần đọc dữ liệu ─────────────────────────

const DAY = 864e5;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

type Prepared = {
  deals: { id: string; title: string; amount: number; ownerName: string; status: string; createdAt: Date; updatedAt: Date; dataJson: string; winProb: number | null }[];
  open: { id: string; row: FeatureRow; stage: number; idle: number }[];
  closed: { id: string; row: FeatureRow; won: boolean }[];
  won: Set<string>;
  lost: Set<string>;
  baseRate?: number;
  dateField?: string;
  avgCloseDays: number;
};

/** Gom deals, khách, cuộc gọi, hoạt động của một workspace thành bảng đặc trưng. */
async function prepare(workspaceId: string, cfg: WorkspaceConfig): Promise<Prepared | null> {
  const obj = getObject(cfg, "deals");
  if (!obj) return null;
  const { won, lost } = wonLost(cfg);
  // Thứ tự giai đoạn: bỏ trạng thái thua, trạng thái thắng đầu tiên là đích (vị trí 1).
  const path = obj.statuses.filter((s) => !lost.has(s.key)).map((s) => s.key);
  const wi = path.findIndex((k) => won.has(k));
  const wonIdx = Math.max(1, wi >= 0 ? wi : path.length - 1);
  const stageOf = (key: string) => {
    const i = path.indexOf(key);
    return i < 0 ? 0 : Math.min(1, i / wonIdx);
  };
  const labelToKey = new Map(obj.statuses.map((s) => [norm(s.label), s.key]));

  const [deals, contacts, calls] = await Promise.all([
    db.record.findMany({ where: { workspaceId, objectKey: "deals" }, select: { id: true, title: true, amount: true, ownerName: true, status: true, createdAt: true, updatedAt: true, dataJson: true, winProb: true } }),
    db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, select: { id: true, title: true, score: true, dataJson: true } }),
    db.call.findMany({ where: { workspaceId, recordId: { not: null } }, select: { recordId: true, outcome: true } }),
  ]);
  const acts = deals.length
    ? await db.activity.findMany({ where: { recordId: { in: deals.map((d) => d.id) } }, select: { recordId: true, kind: true, body: true, createdAt: true }, orderBy: { createdAt: "asc" } })
    : [];

  const contactByName = new Map(contacts.map((c) => [norm(c.title), c]));
  const posCalls = new Map<string, number>();
  for (const c of calls) if (c.recordId && POSITIVE.has(c.outcome)) posCalls.set(c.recordId, (posCalls.get(c.recordId) ?? 0) + 1);

  const now = Date.now();
  type Raw = { d: (typeof deals)[number]; channel: string; contact?: (typeof contacts)[number]; nActs: number; stage: number; age: number; idle: number; closed: boolean; isWon: boolean };
  const raws: Raw[] = deals.map((d) => {
    const data = parseJson<Record<string, unknown>>(d.dataJson, {});
    // Khớp deal ↔ khách theo tên: ưu tiên các ô dữ liệu (ví dụ "khach"), rồi đến tiêu đề.
    const contact = [...Object.values(data).filter((v) => typeof v === "string"), d.title].map((v) => contactByName.get(norm(v))).find(Boolean);
    const cData = contact ? parseJson<Record<string, unknown>>(contact.dataJson, {}) : {};
    const channel = norm(cData._kenh || cData._nguon || cData.nguon || data._kenh || data._nguon || "khác");
    const mine = acts.filter((a) => a.recordId === d.id);
    const nActs = mine.filter((a) => a.kind !== "system").length;
    const closed = won.has(d.status) || lost.has(d.status);
    let stage = stageOf(d.status);
    let age = (now - d.createdAt.getTime()) / DAY;
    let idle = (now - d.updatedAt.getTime()) / DAY;
    if (closed) {
      // Với mục đã đóng, lấy giai đoạn ngay trước khi đóng từ nhật ký đổi giai đoạn (“A” sang “B”).
      stage = 0.5;
      for (const a of mine) {
        const m = a.body.match(/từ “(.+?)” sang “(.+?)”/);
        const to = m && labelToKey.get(norm(m[2]));
        const from = m && labelToKey.get(norm(m[1]));
        if (to && (won.has(to) || lost.has(to)) && from) stage = stageOf(from);
      }
      const closeAt = d.updatedAt.getTime();
      age = (closeAt - d.createdAt.getTime()) / DAY;
      const before = mine.filter((a) => a.createdAt.getTime() < closeAt - 60e3).pop();
      idle = before ? (closeAt - before.createdAt.getTime()) / DAY : age;
    }
    return { d, channel, contact, nActs, stage, age: Math.max(0, age), idle: Math.max(0, idle), closed, isWon: won.has(d.status) };
  });

  const closedRaw = raws.filter((r) => r.closed);
  const wins = closedRaw.filter((r) => r.isWon).length;
  const baseRate = closedRaw.length ? wins / closedRaw.length : undefined;
  const chan = new Map<string, { w: number; n: number }>();
  for (const r of closedRaw) {
    const c = chan.get(r.channel) ?? { w: 0, n: 0 };
    c.n++;
    if (r.isWon) c.w++;
    chan.set(r.channel, c);
  }
  const rowOf = (r: Raw): FeatureRow => {
    const c = chan.get(r.channel);
    return {
      stage: r.stage,
      ageDays: Math.min(r.age, 365),
      idleDays: Math.min(r.idle, 365),
      activities: r.nActs,
      logAmount: Math.log1p(Math.max(0, r.d.amount)),
      channelRate: smoothedRate(c?.w ?? 0, c?.n ?? 0, baseRate ?? 0.5),
      positiveCalls: r.contact ? (posCalls.get(r.contact.id) ?? 0) : 0,
      contactScore: r.contact?.score ?? 0,
    };
  };

  const dateField = obj.fields.find((f) => f.type === "date")?.key;
  const wonRaw = closedRaw.filter((r) => r.isWon);
  const avgCloseDays = wonRaw.length ? wonRaw.reduce((s, r) => s + r.age, 0) / wonRaw.length : 30;

  return {
    deals,
    open: raws.filter((r) => !r.closed).map((r) => ({ id: r.d.id, row: rowOf(r), stage: r.stage, idle: r.idle })),
    closed: closedRaw.map((r) => ({ id: r.d.id, row: rowOf(r), won: r.isWon })),
    won,
    lost,
    baseRate,
    dateField,
    avgCloseDays: Math.max(3, avgCloseDays),
  };
}

/** Chấm xác suất cho các deal đang mở. Trả map id → % và số deal đã đóng dùng huấn luyện (0 = tiên nghiệm). */
function score(p: Prepared) {
  const both = p.closed.some((c) => c.won) && p.closed.some((c) => !c.won);
  const probs = new Map<string, number>();
  if (p.closed.length >= MIN_TRAIN && both) {
    const model = trainLogistic(
      p.closed.map((c) => rowToVector(c.row)),
      p.closed.map((c) => (c.won ? 1 : 0)),
    );
    for (const o of p.open) probs.set(o.id, toPercent(predictProba(model, rowToVector(o.row))));
    return { probs, trainedOn: p.closed.length };
  }
  for (const o of p.open) probs.set(o.id, toPercent(priorProb(o.stage, o.idle, p.closed.length >= 5 ? p.baseRate : undefined)));
  return { probs, trainedOn: 0 };
}

async function loadConfig(workspaceId: string) {
  const cfg = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return parseJson<WorkspaceConfig | null>(cfg?.configJson, null);
}

/** Tính lại Record.winProb cho deals (đang mở: theo mô hình; thắng = 100; thua = 0). */
export async function refreshPredictions(workspaceId?: string): Promise<void> {
  const ids = workspaceId ? [workspaceId] : (await db.workspace.findMany({ where: { onboarded: true }, select: { id: true } })).map((w) => w.id);
  for (const wid of ids) {
    const cfg = await loadConfig(wid);
    if (!cfg) continue;
    const p = await prepare(wid, cfg);
    if (!p) continue;
    const { probs } = score(p);
    const updates: [string, number][] = p.deals.map((d) => [d.id, p.won.has(d.status) ? 100 : p.lost.has(d.status) ? 0 : (probs.get(d.id) ?? 0)]);
    const changed = updates.filter(([id, v]) => p.deals.find((d) => d.id === id)?.winProb !== v);
    // Dùng SQL thô để không chạm updatedAt (đặc trưng "số ngày từ lần cập nhật cuối" dựa vào cột này).
    for (let i = 0; i < changed.length; i += 100) {
      await db.$transaction(changed.slice(i, i + 100).map(([id, v]) => db.$executeRaw`UPDATE "Record" SET "winProb" = ${v} WHERE "id" = ${id}`));
    }
  }
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Dự báo doanh thu: pipeline, giá trị kỳ vọng, theo tháng dự kiến chốt, top deal. byMonth.month dạng "YYYY-MM". */
export async function forecastWorkspace(workspaceId: string): Promise<Forecast> {
  const empty: Forecast = { pipeline: 0, weighted: 0, byMonth: [], deals: [], trainedOn: 0 };
  const cfg = await loadConfig(workspaceId);
  if (!cfg) return empty;
  const p = await prepare(workspaceId, cfg);
  if (!p) return empty;
  const { probs, trainedOn } = score(p);
  const now = Date.now();
  const open = p.deals.filter((d) => !p.won.has(d.status) && !p.lost.has(d.status));
  const months = new Map<string, number>();
  const rows = open.map((d) => {
    const prob = probs.get(d.id) ?? d.winProb ?? 0;
    // Ngày dự kiến chốt: ô ngày đầu tiên của deal nếu có, không thì theo tốc độ chốt trung bình.
    const raw = p.dateField ? parseJson<Record<string, unknown>>(d.dataJson, {})[p.dateField] : undefined;
    const fromField = raw ? new Date(String(raw)) : null;
    let at = fromField && !isNaN(fromField.getTime()) ? fromField.getTime() : d.createdAt.getTime() + p.avgCloseDays * DAY;
    if (at < now) at = now + 7 * DAY;
    const k = monthKey(new Date(at));
    months.set(k, (months.get(k) ?? 0) + (d.amount * prob) / 100);
    return { id: d.id, title: d.title, amount: d.amount, prob, ownerName: d.ownerName };
  });
  return {
    pipeline: open.reduce((s, d) => s + d.amount, 0),
    weighted: Math.round(rows.reduce((s, r) => s + (r.amount * r.prob) / 100, 0)),
    byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount: Math.round(amount) })),
    deals: rows.sort((a, b) => b.amount * b.prob - a.amount * a.prob).slice(0, 10),
    trainedOn,
  };
}
