// Bộ máy đo lường hiệu suất nhân viên — phần THUẦN (không đụng DB, dùng được cả ở trình duyệt).
// Dữ liệu thô ("facts") do src/lib/perf/facts.ts nạp một lần cho cả cửa sổ thời gian; mọi chỉ số của bất kỳ
// khoảng con nào (kỳ này, kỳ trước, từng tuần cho biểu đồ) đều tính lại từ facts trong bộ nhớ, không truy vấn thêm.

// ======================= Định nghĩa chỉ số =======================

export type MetricGroup = "result" | "activity" | "speed" | "quality";
export const GROUP_LABEL: Record<MetricGroup, string> = { result: "Kết quả", activity: "Hoạt động", speed: "Tốc độ", quality: "Chất lượng" };
export const GROUPS: MetricGroup[] = ["result", "activity", "speed", "quality"];

export type Unit = "vnd" | "count" | "pct" | "min" | "hour" | "day" | "score" | "star" | "nps";

export type MetricDef = {
  label: string;
  group: MetricGroup;
  unit: Unit;
  /** Cách tính, hiển thị cho người dùng. */
  formula: string;
  higherBetter: boolean;
  /** Ảnh chụp hiện tại (không theo khoảng thời gian): không có so sánh kỳ trước / biểu đồ tuần. */
  snapshot?: boolean;
};

export const METRIC_KEYS = [
  "revenue",
  "won_deals",
  "avg_deal",
  "win_rate",
  "new_contacts",
  "orders",
  "overdue_debt",
  "calls",
  "call_minutes",
  "call_connect_rate",
  "call_positive_rate",
  "call_quality",
  "replies",
  "notes",
  "quotes_sent",
  "tasks_done",
  "task_ontime",
  "speed_to_lead",
  "first_response",
  "ticket_resolve",
  "ticket_sla",
  "sales_cycle",
  "stale_deals",
  "csat",
  "nps",
  "repeat_rate",
  "complaints",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export const isMetricKey = (s: string): s is MetricKey => (METRIC_KEYS as readonly string[]).includes(s);

export const METRIC_DEFS: Record<MetricKey, MetricDef> = {
  revenue: { label: "Doanh thu", group: "result", unit: "vnd", higherBetter: true, formula: "Tổng phiếu thu trong kỳ (theo ngày thu), gán cho người phụ trách giao dịch → người phụ trách khách → người tạo đơn → người lập phiếu (giống KPI). Chưa có phiếu thu nào thì cộng giá trị giao dịch thắng trong kỳ." },
  won_deals: { label: "Giao dịch thắng", group: "result", unit: "count", higherBetter: true, formula: "Số giao dịch chuyển sang trạng thái thắng (màu xanh lá) trong kỳ, theo người phụ trách." },
  avg_deal: { label: "Giá trị giao dịch TB", group: "result", unit: "vnd", higherBetter: true, formula: "Tổng giá trị giao dịch thắng ÷ số giao dịch thắng trong kỳ." },
  win_rate: { label: "Tỉ lệ chốt", group: "result", unit: "pct", higherBetter: true, formula: "Thắng ÷ (thắng + thua) của các giao dịch đóng trong kỳ." },
  new_contacts: { label: "Khách mới phụ trách", group: "result", unit: "count", higherBetter: true, formula: "Số khách tạo trong kỳ đang do người này phụ trách." },
  orders: { label: "Đơn hàng", group: "result", unit: "count", higherBetter: true, formula: "Số đơn (trừ đơn huỷ) tạo trong kỳ, gán người như doanh thu." },
  overdue_debt: { label: "Công nợ quá hạn", group: "result", unit: "vnd", higherBetter: false, snapshot: true, formula: "Hiện tại: tổng phần chưa thu của các đơn đã quá hạn thanh toán, thuộc khách/giao dịch người này phụ trách." },
  calls: { label: "Cuộc gọi", group: "activity", unit: "count", higherBetter: true, formula: "Số cuộc gọi bắt đầu trong kỳ (người gọi = nhân viên)." },
  call_minutes: { label: "Thời lượng gọi", group: "activity", unit: "min", higherBetter: true, formula: "Tổng thời lượng các cuộc gọi trong kỳ (phút)." },
  call_connect_rate: { label: "Tỉ lệ nghe máy", group: "activity", unit: "pct", higherBetter: true, formula: "Cuộc gọi khách nghe máy (đã tư vấn, đặt lịch, chốt, hẹn gọi lại, không nhu cầu) ÷ tổng cuộc gọi." },
  call_positive_rate: { label: "Cuộc gọi tích cực", group: "activity", unit: "pct", higherBetter: true, formula: "Cuộc gọi kết quả đặt lịch hoặc chốt được ÷ tổng cuộc gọi." },
  call_quality: { label: "Điểm chất lượng gọi", group: "activity", unit: "score", higherBetter: true, formula: "Trung bình điểm cuộc gọi (0–100): điểm quản lý duyệt nếu có, không thì điểm AI theo bảng tiêu chí (scorecard)." },
  replies: { label: "Tin nhắn đã trả lời", group: "activity", unit: "count", higherBetter: true, formula: "Số tin nhắn gửi đi ở Hộp thư trong kỳ (người gửi, không có thì người được giao hội thoại)." },
  notes: { label: "Cập nhật / ghi chú", group: "activity", unit: "count", higherBetter: true, formula: "Số cập nhật, ghi chú do chính nhân viên viết trên khách/giao dịch (không tính dòng hệ thống, AI, tự động)." },
  quotes_sent: { label: "Báo giá đã gửi", group: "activity", unit: "count", higherBetter: true, formula: "Báo giá do người này lập trong kỳ và đã gửi khách (đã gửi / chấp nhận / từ chối / hết hạn). Hệ thống chưa lưu thời điểm gửi nên tính theo ngày lập." },
  tasks_done: { label: "Việc hoàn thành", group: "activity", unit: "count", higherBetter: true, formula: "Việc được giao có hạn trong kỳ và đã đánh dấu xong. (Hệ thống chưa lưu thời điểm hoàn thành nên tính theo hạn.)" },
  task_ontime: { label: "Việc đúng hạn", group: "activity", unit: "pct", higherBetter: true, formula: "Việc có hạn trong kỳ đã xong ÷ việc có hạn trong kỳ đã tới hạn (việc chưa tới hạn không tính)." },
  speed_to_lead: { label: "Tốc độ liên hệ khách mới", group: "speed", unit: "min", higherBetter: false, formula: "Trung vị thời gian từ lúc khách mới vào (lead đầu tiên hoặc lúc tạo khách) đến lần liên hệ đầu tiên của người phụ trách (cuộc gọi, tin nhắn gửi đi hoặc ghi chú). Khách chưa được liên hệ không tính vào trung vị." },
  first_response: { label: "Phản hồi đầu tiên ở Hộp thư", group: "speed", unit: "min", higherBetter: false, formula: "Trung vị thời gian từ tin nhắn khách (sau lượt trả lời trước) đến tin trả lời kế tiếp, gán cho người trả lời." },
  ticket_resolve: { label: "Thời gian xử lý phiếu", group: "speed", unit: "hour", higherBetter: false, formula: "Trung vị (giờ) từ lúc tạo đến lúc xử lý xong của các phiếu hỗ trợ xong trong kỳ." },
  ticket_sla: { label: "Phiếu đúng SLA", group: "speed", unit: "pct", higherBetter: true, formula: "Phiếu xong trong kỳ có hạn SLA, xong trước hạn ÷ tổng các phiếu đó." },
  sales_cycle: { label: "Chu kỳ bán hàng", group: "speed", unit: "day", higherBetter: false, formula: "Trung vị số ngày từ lúc tạo giao dịch đến lúc thắng, của các giao dịch thắng trong kỳ." },
  stale_deals: { label: "Giao dịch tồn đọng", group: "speed", unit: "count", higherBetter: false, snapshot: true, formula: "Hiện tại: giao dịch đang mở không có cập nhật quá N ngày (mặc định 14)." },
  csat: { label: "CSAT", group: "quality", unit: "star", higherBetter: true, formula: "Điểm hài lòng trung bình (1–5) của phiếu hỗ trợ người này xử lý xong trong kỳ." },
  nps: { label: "NPS", group: "quality", unit: "nps", higherBetter: true, formula: "% khách chấm 9–10 trừ % khách chấm 0–6, của khảo sát nộp trong kỳ từ khách người này phụ trách (hoặc phiếu người này xử lý)." },
  repeat_rate: { label: "Tỉ lệ khách quay lại", group: "quality", unit: "pct", higherBetter: true, formula: "Khách có đơn trong kỳ mà đã từng mua trước đó ÷ số khách có đơn trong kỳ." },
  complaints: { label: "Khiếu nại", group: "quality", unit: "count", higherBetter: false, formula: "Phiếu hỗ trợ phân loại “Khiếu nại…” tạo trong kỳ, của khách người này phụ trách (khách chưa có người phụ trách thì tính cho người xử lý phiếu)." },
};

/** Chỉ số chính hiện ở bảng xếp hạng tổng quan. */
export const LEADER_KEYS: MetricKey[] = ["revenue", "won_deals", "win_rate", "calls", "call_quality", "replies", "speed_to_lead", "task_ontime", "csat"];

// ======================= Hàm thống kê =======================

/** Trung vị; mảng rỗng → null. */
export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function mean(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
}

/** Tỉ lệ % (1 chữ số thập phân); mẫu = 0 → null (chưa có dữ liệu, khác với 0%). */
export function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

export type Delta = { abs: number; pct: number | null; better: boolean | null };

/**
 * So với kỳ trước: chênh lệch tuyệt đối, % thay đổi (kỳ trước = 0 thì null) và có tốt hơn không
 * (theo chiều "càng cao càng tốt" của chỉ số). Thiếu một trong hai giá trị → null.
 */
export function delta(cur: number | null, prev: number | null, higherBetter = true): Delta | null {
  if (cur == null || prev == null) return null;
  const abs = cur - prev;
  const pct = prev !== 0 ? round1((abs / Math.abs(prev)) * 100) : null;
  return { abs, pct, better: abs === 0 ? null : abs > 0 === higherBetter };
}

/**
 * Bách phân vị (0–100) của v trong quần thể, kiểu "trung điểm hạng": (số nhỏ hơn + ½ số bằng) ÷ n.
 * higherBetter = false thì đảo chiều (giá trị nhỏ được điểm cao). Quần thể 1 người → 50.
 */
export function percentile(v: number, population: number[], higherBetter = true): number {
  const pop = population.filter((x) => Number.isFinite(x));
  if (!pop.length) return 50;
  let below = 0;
  let equal = 0;
  for (const x of pop) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  const p = ((below + equal / 2) / pop.length) * 100;
  return Math.round(higherBetter ? p : 100 - p);
}

/** Điểm z so với quần thể (độ lệch chuẩn = 0 → 0). */
export function zScore(v: number, population: number[]): number {
  const m = mean(population);
  if (m == null) return 0;
  const sd = Math.sqrt(population.reduce((s, x) => s + (x - m) ** 2, 0) / population.length);
  return sd > 0 ? round1((v - m) / sd) : 0;
}

// ======================= Khoảng thời gian (giờ Việt Nam) =======================

const VN = 7 * 3600e3;
const DAY = 864e5;
export const MAX_RANGE_DAYS = 366;

export type RangePreset = "7d" | "30d" | "90d" | "month" | "quarter" | "custom";
export const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "90d", label: "90 ngày" },
  { key: "month", label: "Tháng này" },
  { key: "quarter", label: "Quý này" },
  { key: "custom", label: "Tùy chọn" },
];
export const isPreset = (s: string | null | undefined): s is RangePreset => RANGE_PRESETS.some((p) => p.key === s);

export type Span = { from: number; to: number };
export type ResolvedRange = { preset: RangePreset; cur: Span; prev: Span; label: string };

/** 00:00 giờ VN của ngày chứa t. */
export const vnDayStart = (t: number) => Math.floor((t + VN) / DAY) * DAY - VN;
/** "YYYY-MM-DD" theo giờ VN. */
export const vnDate = (t: number) => new Date(t + VN).toISOString().slice(0, 10);
const parseVnDate = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) - VN : NaN);

/**
 * Khoảng xem [from, to) và kỳ trước bằng độ dài liền kề [from − độ dài, from).
 * 7/30/90 ngày: tính cả hôm nay, kết thúc ở thời điểm hiện tại. Tháng/quý này: từ đầu tháng/quý tới hiện tại.
 * Tùy chọn: từ 00:00 ngày đầu tới hết ngày cuối (giờ VN), tối đa 366 ngày. Ngày không hợp lệ → 30 ngày.
 */
export function resolveRange(preset: string | null | undefined, now = Date.now(), fromStr?: string | null, toStr?: string | null): ResolvedRange {
  const p: RangePreset = isPreset(preset) ? preset : "30d";
  const today = vnDayStart(now);
  let from: number;
  let to = now;
  if (p === "custom") {
    const f = parseVnDate(fromStr ?? "");
    const t = parseVnDate(toStr ?? "");
    if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) return resolveRange("30d", now);
    from = f;
    to = Math.min(t + DAY, today + DAY);
    if (to <= from) to = from + DAY;
    if (to - from > MAX_RANGE_DAYS * DAY) from = to - MAX_RANGE_DAYS * DAY;
  } else if (p === "month" || p === "quarter") {
    const d = new Date(now + VN);
    const m = p === "month" ? d.getUTCMonth() : Math.floor(d.getUTCMonth() / 3) * 3;
    from = Date.UTC(d.getUTCFullYear(), m, 1) - VN;
  } else {
    const n = p === "7d" ? 7 : p === "90d" ? 90 : 30;
    from = today - (n - 1) * DAY;
  }
  const len = to - from;
  const label = `${fmtDay(from)} – ${fmtDay(to - 1)}`;
  return { preset: p, cur: { from, to }, prev: { from: from - len, to: from }, label };
}

const fmtDay = (t: number) => {
  const d = new Date(t + VN);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

/** n tuần gần nhất (thứ Hai → thứ Hai, giờ VN), tuần cuối chứa `end` (có thể chưa trọn). */
export function weekSpans(end: number, n = 8): (Span & { label: string })[] {
  const dayStart = vnDayStart(end - 1);
  const dow = (new Date(dayStart + VN).getUTCDay() + 6) % 7; // 0 = thứ Hai
  const monday = dayStart - dow * DAY;
  const out: (Span & { label: string })[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = monday - i * 7 * DAY;
    const d = new Date(from + VN);
    out.push({ from, to: Math.min(from + 7 * DAY, end), label: `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}` });
  }
  return out;
}

// ======================= Dữ liệu thô =======================

/** Thời điểm tính bằng mili-giây (epoch) để dễ chuyển qua JSON. */
export type Facts = {
  revenueSource: "payments" | "deals";
  payments: { who: string; at: number; amount: number }[];
  closed: { who: string; at: number; won: boolean; amount: number; createdAt: number }[];
  leads: { who: string; at: number; firstTouch: number | null }[];
  orders: { who: string; at: number; contactId: string | null; returning: boolean }[];
  calls: { who: string; at: number; dur: number; outcome: string; score: number | null }[];
  replies: { who: string; at: number }[];
  responses: { who: string; at: number; min: number }[];
  notes: { who: string; at: number }[];
  quotes: { who: string; at: number }[];
  tasks: { who: string; due: number; done: boolean }[];
  tickets: { who: string; createdAt: number; resolvedAt: number | null; dueAt: number | null; csat: number | null }[];
  surveys: { who: string; at: number; nps: number | null }[];
  complaints: { who: string; at: number }[];
  /** Ảnh chụp hiện tại. */
  debts: Record<string, { amount: number; count: number }>;
  stale: { who: string; id: string; title: string; amount: number; idleDays: number }[];
  /** Thời điểm "bây giờ" lúc nạp (để xét việc đã tới hạn). */
  now: number;
};

export const emptyFacts = (now = Date.now()): Facts => ({ revenueSource: "deals", payments: [], closed: [], leads: [], orders: [], calls: [], replies: [], responses: [], notes: [], quotes: [], tasks: [], tickets: [], surveys: [], complaints: [], debts: {}, stale: [], now });

/** Kết quả gọi “tích cực” và “có nói chuyện” (lặp lại từ calls-shared để file này không phụ thuộc). */
const POSITIVE = new Set(["appointment", "won"]);
const TALKED = new Set(["connected", "appointment", "won", "callback", "not_interested"]);

export type Values = Record<MetricKey, number | null>;

/**
 * Tính toàn bộ chỉ số cho một người hoặc một nhóm (who = danh sách tên) trong khoảng [from, to).
 * Nhóm: gộp dữ liệu thô rồi mới tính (tỉ lệ = tổng tử ÷ tổng mẫu, trung vị trên toàn bộ mẫu), không lấy trung bình của trung bình.
 * Chỉ số không có dữ liệu trả null (ví dụ chưa có giao dịch nào đóng thì tỉ lệ chốt = null).
 */
export function computeMetrics(f: Facts, who: string | string[], span: Span): Values {
  const set = new Set(Array.isArray(who) ? who : [who]);
  const inR = (t: number | null) => t != null && t >= span.from && t < span.to;
  const mine = <T extends { who: string }>(xs: T[]) => xs.filter((x) => set.has(x.who));

  const pays = mine(f.payments).filter((p) => inR(p.at));
  const closed = mine(f.closed).filter((c) => inR(c.at));
  const won = closed.filter((c) => c.won);
  const wonSum = won.reduce((s, c) => s + c.amount, 0);
  const revenue = f.revenueSource === "payments" ? pays.reduce((s, p) => s + p.amount, 0) : wonSum;

  const calls = mine(f.calls).filter((c) => inR(c.at));
  const scored = calls.filter((c) => c.score != null).map((c) => c.score!);
  const leads = mine(f.leads).filter((l) => inR(l.at));
  const touched = leads.filter((l) => l.firstTouch != null && l.firstTouch >= l.at);
  const orders = mine(f.orders).filter((o) => inR(o.at));
  const buyers = new Map<string, boolean>();
  for (const o of orders) if (o.contactId) buyers.set(o.contactId, (buyers.get(o.contactId) ?? false) || o.returning);
  const tasks = mine(f.tasks).filter((t) => inR(t.due));
  const tasksDue = tasks.filter((t) => t.due <= f.now);
  const resolved = mine(f.tickets).filter((t) => inR(t.resolvedAt));
  const withSla = resolved.filter((t) => t.dueAt != null);
  const csat = resolved.filter((t) => t.csat != null).map((t) => t.csat!);
  const nps = mine(f.surveys).filter((s) => inR(s.at) && s.nps != null).map((s) => s.nps!);
  let debt = 0;
  for (const w of set) debt += f.debts[w]?.amount ?? 0;

  return {
    revenue,
    won_deals: won.length,
    avg_deal: won.length ? Math.round(wonSum / won.length) : null,
    win_rate: rate(won.length, closed.length),
    new_contacts: leads.length,
    orders: orders.length,
    overdue_debt: debt,
    calls: calls.length,
    call_minutes: Math.round(calls.reduce((s, c) => s + c.dur, 0) / 60),
    call_connect_rate: rate(calls.filter((c) => TALKED.has(c.outcome)).length, calls.length),
    call_positive_rate: rate(calls.filter((c) => POSITIVE.has(c.outcome)).length, calls.length),
    call_quality: scored.length ? Math.round(mean(scored)!) : null,
    replies: mine(f.replies).filter((r) => inR(r.at)).length,
    notes: mine(f.notes).filter((n) => inR(n.at)).length,
    quotes_sent: mine(f.quotes).filter((q) => inR(q.at)).length,
    tasks_done: tasks.filter((t) => t.done).length,
    task_ontime: rate(tasksDue.filter((t) => t.done).length, tasksDue.length),
    speed_to_lead: nullRound(median(touched.map((l) => (l.firstTouch! - l.at) / 60e3))),
    first_response: nullRound(median(mine(f.responses).filter((r) => inR(r.at)).map((r) => r.min))),
    ticket_resolve: nullRound1(median(resolved.map((t) => (t.resolvedAt! - t.createdAt) / 3600e3))),
    ticket_sla: rate(withSla.filter((t) => t.resolvedAt! <= t.dueAt!).length, withSla.length),
    sales_cycle: nullRound1(median(won.map((c) => Math.max(0, c.at - c.createdAt) / DAY))),
    stale_deals: f.stale.filter((s) => set.has(s.who)).length,
    csat: csat.length ? round1(mean(csat)!) : null,
    nps: nps.length ? Math.round(((nps.filter((n) => n >= 9).length - nps.filter((n) => n <= 6).length) / nps.length) * 100) : null,
    repeat_rate: rate([...buyers.values()].filter(Boolean).length, buyers.size),
    complaints: mine(f.complaints).filter((c) => inR(c.at)).length,
  };
}

const nullRound = (v: number | null) => (v == null ? null : Math.round(v));
const nullRound1 = (v: number | null) => (v == null ? null : round1(v));

/** Đếm số lead đã/ chưa được liên hệ (để hiển thị kèm speed-to-lead). */
export function leadTouchStats(f: Facts, who: string | string[], span: Span) {
  const set = new Set(Array.isArray(who) ? who : [who]);
  const leads = f.leads.filter((l) => set.has(l.who) && l.at >= span.from && l.at < span.to);
  return { leads: leads.length, touched: leads.filter((l) => l.firstTouch != null).length };
}

// ======================= Phễu, bản đồ nhiệt =======================

export type FunnelStep = { key: "lead" | "contacted" | "quoted" | "won"; label: string; value: number; conv: number | null };

/**
 * Phễu trong kỳ: khách mới → đã liên hệ (khách mới được liên hệ) → báo giá đã gửi → giao dịch thắng.
 * conv = % so với bước liền trước (bước trước = 0 → null). Các bước tính theo kỳ, không theo đúng từng khách,
 * nên tỉ lệ có thể vượt 100% (ví dụ chốt khách cũ) — giao diện hiển thị nguyên số.
 */
export function funnel(f: Facts, who: string | string[], span: Span): FunnelStep[] {
  const v = computeMetrics(f, who, span);
  const t = leadTouchStats(f, who, span);
  const steps: Omit<FunnelStep, "conv">[] = [
    { key: "lead", label: "Khách mới", value: t.leads },
    { key: "contacted", label: "Đã liên hệ", value: t.touched },
    { key: "quoted", label: "Báo giá", value: v.quotes_sent ?? 0 },
    { key: "won", label: "Thắng", value: v.won_deals ?? 0 },
  ];
  return steps.map((s, i) => ({ ...s, conv: i === 0 ? null : rate(s.value, steps[i - 1].value) }));
}

/**
 * Bản đồ nhiệt hoạt động: 7 hàng (thứ Hai → Chủ nhật) × 24 cột giờ (giờ VN), đếm cuộc gọi + tin nhắn gửi + ghi chú.
 */
export function heatmap(f: Facts, who: string | string[], span: Span): number[][] {
  const set = new Set(Array.isArray(who) ? who : [who]);
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const put = (t: number) => {
    const d = new Date(t + VN);
    grid[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
  };
  for (const xs of [f.calls, f.replies, f.notes] as { who: string; at: number }[][]) for (const x of xs) if (set.has(x.who) && x.at >= span.from && x.at < span.to) put(x.at);
  return grid;
}

/** Chuỗi giá trị theo tuần của một chỉ số (cho biểu đồ mini / xu hướng). Ảnh chụp → null. */
export function weeklySeries(f: Facts, who: string | string[], key: MetricKey, weeks: Span[]): (number | null)[] {
  if (METRIC_DEFS[key].snapshot) return weeks.map(() => null);
  return weeks.map((w) => computeMetrics(f, who, w)[key]);
}

// ======================= Điểm hiệu suất tổng hợp =======================

export type ScoreWeights = Partial<Record<MetricKey, number>>;
export const SCORE_DEFAULT: ScoreWeights = { revenue: 25, win_rate: 15, calls: 10, call_quality: 10, replies: 5, speed_to_lead: 15, task_ontime: 10, csat: 10 };
export const SCORE_EXPLAIN =
  "Mỗi chỉ số được quy về bách phân vị 0–100 so với toàn bộ nhân viên trong cùng kỳ (chỉ số “càng thấp càng tốt” như tốc độ phản hồi thì đảo chiều). Điểm hiệu suất = trung bình có trọng số các bách phân vị; chỉ số người đó chưa có dữ liệu (ví dụ chưa có phiếu CSAT) được bỏ khỏi mẫu số, không bị tính 0.";

/** Chuẩn hoá trọng số: chỉ giữ chỉ số hợp lệ, trọng số 0–100. Rỗng → mặc định. */
export function normWeights(w: unknown): ScoreWeights {
  const out: ScoreWeights = {};
  if (w && typeof w === "object")
    for (const [k, v] of Object.entries(w as Record<string, unknown>)) if (isMetricKey(k) && typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.min(100, v);
  return Object.keys(out).length ? out : { ...SCORE_DEFAULT };
}

/**
 * Điểm hiệu suất (0–100) cho từng người. `values[who]` là chỉ số của người đó; bách phân vị tính trong
 * toàn bộ `values` (những ai có dữ liệu chỉ số đó). Không có chỉ số nào có dữ liệu → null.
 */
export function perfScores(values: Record<string, Values>, weights: ScoreWeights): { score: Record<string, number | null>; pct: Record<string, Partial<Record<MetricKey, number>>> } {
  const people = Object.keys(values);
  const score: Record<string, number | null> = {};
  const pct: Record<string, Partial<Record<MetricKey, number>>> = {};
  const pops: Partial<Record<MetricKey, number[]>> = {};
  for (const k of METRIC_KEYS) pops[k] = people.map((p) => values[p][k]).filter((v): v is number => v != null);
  for (const p of people) {
    pct[p] = {};
    for (const k of METRIC_KEYS) {
      const v = values[p][k];
      if (v != null) pct[p][k] = percentile(v, pops[k]!, METRIC_DEFS[k].higherBetter);
    }
    let w = 0;
    let s = 0;
    for (const [k, wt] of Object.entries(weights) as [MetricKey, number][]) {
      const q = pct[p][k];
      if (q == null || !(wt > 0)) continue;
      w += wt;
      s += wt * q;
    }
    score[p] = w > 0 ? Math.round(s / w) : null;
  }
  return { score, pct };
}

/** Thứ hạng 1-based theo điểm giảm dần (người không có điểm xếp cuối, cùng điểm cùng hạng). */
export function ranks(score: Record<string, number | null>): Record<string, number> {
  const list = Object.entries(score).sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1));
  const out: Record<string, number> = {};
  list.forEach(([who, s], i) => {
    const prev = list[i - 1];
    out[who] = i > 0 && prev[1] === s ? out[prev[0]] : i + 1;
  });
  return out;
}

/** Trung vị từng chỉ số của một nhóm người (bỏ người không có dữ liệu). */
export function medians(values: Values[]): Values {
  const out = {} as Values;
  for (const k of METRIC_KEYS) out[k] = nullRound1(median(values.map((v) => v[k]).filter((x): x is number => x != null)));
  return out;
}

// ======================= Điểm mạnh / yếu, cảnh báo =======================

export type Insight = { key: MetricKey; label: string; value: number; median: number; diffPct: number };

/**
 * So từng chỉ số với trung vị đội: chênh lệch tương đối có hướng (dương = tốt hơn đội).
 * Điểm mạnh = 2 chỉ số tốt hơn nhiều nhất; cần cải thiện = 2 chỉ số kém hơn nhiều nhất. Trung vị 0 thì dùng 1 làm mẫu.
 */
export function strengthsWeaknesses(v: Values, med: Values, n = 2): { strengths: Insight[]; weaknesses: Insight[] } {
  const all: Insight[] = [];
  for (const k of METRIC_KEYS) {
    const a = v[k];
    const m = med[k];
    if (a == null || m == null || a === m) continue;
    const d = METRIC_DEFS[k];
    const rel = ((a - m) / Math.max(1, Math.abs(m))) * (d.higherBetter ? 1 : -1);
    all.push({ key: k, label: d.label, value: a, median: m, diffPct: Math.round(rel * 100) });
  }
  // Sắp ổn định: cùng mức chênh thì giữ thứ tự trong METRIC_KEYS (chỉ số kết quả trước).
  return {
    strengths: all.filter((x) => x.diffPct > 0).sort((a, b) => b.diffPct - a.diffPct).slice(0, n),
    weaknesses: all.filter((x) => x.diffPct < 0).sort((a, b) => a.diffPct - b.diffPct).slice(0, n),
  };
}

export type PerfAlert = { who: string; kind: "drop" | "stale" | "slow_lead"; text: string; severity: "warn" | "danger" };

export const ALERT_DROP = 0.2;
export const ALERT_SLOW_LEAD_MIN = 60;
const DROP_KEYS: MetricKey[] = ["revenue", "won_deals", "calls", "replies", "notes"];

/**
 * Cảnh báo cho từng người:
 * - "drop": chỉ số chính giảm quá 20% so với kỳ trước (kỳ trước phải có số đủ lớn: ≥ 3 với số đếm, > 0 với tiền).
 * - "stale": có giao dịch tồn đọng.
 * - "slow_lead": trung vị tốc độ liên hệ khách mới quá 60 phút.
 */
export function buildAlerts(rows: { who: string; cur: Values; prev: Values }[], fmt: (k: MetricKey, v: number) => string = (_k, v) => String(v)): PerfAlert[] {
  const out: PerfAlert[] = [];
  for (const r of rows) {
    const drops = DROP_KEYS.filter((k) => {
      const c = r.cur[k];
      const p = r.prev[k];
      if (c == null || p == null) return false;
      if (METRIC_DEFS[k].unit === "vnd" ? !(p > 0) : p < 3) return false;
      return c < p * (1 - ALERT_DROP);
    });
    if (drops.length)
      out.push({
        who: r.who,
        kind: "drop",
        severity: drops.some((k) => r.cur[k]! < r.prev[k]! * 0.5) ? "danger" : "warn",
        text: drops.map((k) => `${METRIC_DEFS[k].label.toLowerCase()} ${fmt(k, r.cur[k]!)} (kỳ trước ${fmt(k, r.prev[k]!)}, −${Math.round((1 - r.cur[k]! / r.prev[k]!) * 100)}%)`).join("; "),
      });
    const st = r.cur.stale_deals ?? 0;
    if (st > 0) out.push({ who: r.who, kind: "stale", severity: st >= 3 ? "danger" : "warn", text: `${st} giao dịch tồn đọng chưa được cập nhật` });
    const sl = r.cur.speed_to_lead;
    if (sl != null && sl > ALERT_SLOW_LEAD_MIN) out.push({ who: r.who, kind: "slow_lead", severity: sl > 24 * 60 ? "danger" : "warn", text: `liên hệ khách mới chậm: trung vị ${fmt("speed_to_lead", sl)}` });
  }
  return out;
}

// ======================= Định dạng =======================

/** Định dạng giá trị theo đơn vị (dùng chung server/trình duyệt). */
export function fmtValue(key: MetricKey, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const u = METRIC_DEFS[key].unit;
  const n = (x: number, d = 0) => x.toLocaleString("vi-VN", { maximumFractionDigits: d });
  switch (u) {
    case "vnd":
      return money(v);
    case "pct":
      return `${n(v, 1)}%`;
    case "min":
      return duration(v);
    case "hour":
      return v >= 48 ? `${n(v / 24, 1)} ngày` : `${n(v, 1)} giờ`;
    case "day":
      return `${n(v, 1)} ngày`;
    case "star":
      return `${n(v, 1)}★`;
    case "nps":
      return `${v > 0 ? "+" : ""}${n(v)}`;
    default:
      return n(v, 1);
  }
}

/** Phút → "45 phút" / "2,5 giờ" / "3 ngày". */
export function duration(min: number) {
  const n = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (min < 1) return "< 1 phút";
  if (min < 90) return `${Math.round(min)} phút`;
  if (min < 48 * 60) return `${n(min / 60)} giờ`;
  return `${n(min / 1440)} ngày`;
}

function money(v: number) {
  const a = Math.abs(v);
  const n = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (a >= 1e9) return `${n(v / 1e9)} tỷ`;
  if (a >= 1e6) return `${n(v / 1e6)} tr`;
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString("vi-VN")}k`;
  return v.toLocaleString("vi-VN");
}

// ======================= Nguồn điểm đánh giá từ chỉ số =======================

/**
 * Điểm 0–100 cho tiêu chí đánh giá nguồn "metric:<key>":
 * - Chỉ số thang tuyệt đối — tỉ lệ % và điểm chất lượng cuộc gọi (0–100) — lấy nguyên giá trị; CSAT 1–5 → ×20;
 *   NPS −100..100 → (NPS + 100) ÷ 2. Chỉ số "càng thấp càng tốt" dạng % (hiện không có) sẽ đảo 100 − giá trị.
 * - Chỉ số còn lại (tiền, số đếm, thời gian) không có thang chung nên dùng bách phân vị trong toàn bộ nhân viên của kỳ.
 * Không có dữ liệu → null (tiêu chí bị bỏ khỏi mẫu số, giống KPI chưa đặt chỉ tiêu).
 */
export function metricReviewScore(key: MetricKey, v: number | null, population: number[]): number | null {
  if (v == null) return null;
  const d = METRIC_DEFS[key];
  const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
  if (d.unit === "pct" || d.unit === "score") return clamp(d.higherBetter ? v : 100 - v);
  if (d.unit === "star") return clamp(v * 20);
  if (d.unit === "nps") return clamp((v + 100) / 2);
  return percentile(v, population.length ? population : [v], d.higherBetter);
}

export const REVIEW_METRIC_PREFIX = "metric:";
