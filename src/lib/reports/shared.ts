// Báo cáo tự tạo — phần thuần (dùng được ở trình duyệt và kiểm thử): danh mục nguồn dữ liệu, trường được phép,
// kiểm tra cấu hình, khoảng ngày theo giờ Việt Nam, gom nhóm và tính chỉ số. Không đụng database.
import { z } from "zod";
import type { WorkspaceConfig } from "../config/schema";

// ───────────────────────────── Trường & nguồn dữ liệu ─────────────────────────────

export type FieldType = "text" | "enum" | "owner" | "number" | "money" | "duration" | "date" | "bool";
export type FieldMeta = {
  key: string;
  label: string;
  type: FieldType;
  options?: { key: string; label: string }[];
  /** Cột Prisma thật (cho phép đẩy bộ lọc xuống database). Không có = trường tính / trường tuỳ biến, lọc trong JS. */
  col?: string;
};

export const DATASETS = ["contacts", "deals", "orders", "payments", "calls", "tickets", "conversations", "activities"] as const;
export type DatasetKey = (typeof DATASETS)[number];

export const DATASET_LABEL: Record<DatasetKey, string> = {
  contacts: "Khách",
  deals: "Giao dịch",
  orders: "Đơn hàng",
  payments: "Thanh toán",
  calls: "Cuộc gọi",
  tickets: "Phiếu hỗ trợ",
  conversations: "Hội thoại hộp thư",
  activities: "Hoạt động nhân viên",
};

const opts = (o: Record<string, string>) => Object.entries(o).map(([key, label]) => ({ key, label }));

const ORDER_STATUS_OPTS = opts({ new: "Mới", confirmed: "Đã xác nhận", shipping: "Đang giao", done: "Hoàn tất", cancelled: "Đã huỷ" });
const PAY_METHOD_OPTS = opts({ cash: "Tiền mặt", transfer: "Chuyển khoản", card: "Thẻ", other: "Khác" });
const CALL_OUTCOME_OPTS = opts({
  connected: "Nghe máy, đã tư vấn",
  appointment: "Đặt được lịch hẹn",
  won: "Chốt được",
  callback: "Hẹn gọi lại",
  no_answer: "Không nghe máy",
  busy: "Máy bận / thuê bao",
  not_interested: "Không có nhu cầu",
  wrong: "Sai số",
});
const TICKET_STATUS_OPTS = opts({ open: "Mở", pending: "Đang chờ khách", resolved: "Đã xử lý", closed: "Đóng" });
const TICKET_PRIORITY_OPTS = opts({ urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp" });
const TICKET_CHANNEL_OPTS = opts({ manual: "Nhập tay", inbox: "Hộp thư", call: "Cuộc gọi", form: "Biểu mẫu", email: "Email" });
const CONV_CHANNEL_OPTS = opts({ messenger: "Messenger", zalo: "Zalo", instagram: "Instagram", whatsapp: "WhatsApp", shopee: "Shopee", tiktok: "TikTok", web: "Website" });

/** Trường tuỳ biến của bảng (trong dataJson) được đưa vào báo cáo. Bỏ SĐT/email/liên kết/công thức/thẻ. */
const CUSTOM_OK = new Set(["text", "number", "money", "date", "select", "rating", "checkbox", "progress"]);

function recordFields(cfg: WorkspaceConfig | null, objectKey: "contacts" | "deals"): FieldMeta[] {
  const obj = cfg?.objects.find((o) => o.key === objectKey);
  const out: FieldMeta[] = [
    { key: "title", label: "Tên", type: "text", col: "title" },
    { key: "status", label: obj?.statusLabel || "Trạng thái", type: "enum", col: "status", options: obj?.statuses.map((s) => ({ key: s.key, label: s.label })) ?? [] },
    { key: "ownerName", label: "Người phụ trách", type: "owner", col: "ownerName" },
    { key: "amount", label: obj?.amountLabel || "Giá trị", type: "money", col: "amount" },
    { key: "score", label: "Điểm", type: "number", col: "score" },
    { key: "createdAt", label: "Ngày tạo", type: "date", col: "createdAt" },
    { key: "updatedAt", label: "Ngày cập nhật", type: "date", col: "updatedAt" },
  ];
  if (objectKey === "deals") {
    out.push({ key: "won", label: "Đã chốt", type: "bool" }, { key: "lost", label: "Thua / huỷ", type: "bool" });
  }
  for (const f of obj?.fields ?? []) {
    if (!CUSTOM_OK.has(f.type) || !/^[a-z0-9_]+$/i.test(f.key)) continue;
    const type: FieldType = f.type === "select" ? "enum" : f.type === "money" ? "money" : f.type === "date" ? "date" : f.type === "checkbox" ? "bool" : f.type === "text" ? "text" : "number";
    out.push({ key: `d_${f.key}`, label: f.label, type, ...(f.type === "select" ? { options: f.options.map((o) => ({ key: o.key, label: o.label })) } : {}) });
  }
  return out;
}

/** Danh sách trường được phép của một nguồn — mọi cấu hình chỉ được tham chiếu các khoá trong đây. */
export function datasetFields(ds: DatasetKey, cfg: WorkspaceConfig | null): FieldMeta[] {
  switch (ds) {
    case "contacts":
    case "deals":
      return recordFields(cfg, ds);
    case "orders":
      return [
        { key: "number", label: "Số đơn", type: "text", col: "number" },
        { key: "customerName", label: "Khách hàng", type: "text", col: "customerName" },
        { key: "status", label: "Trạng thái", type: "enum", col: "status", options: ORDER_STATUS_OPTS },
        { key: "createdBy", label: "Người tạo", type: "owner", col: "createdBy" },
        { key: "total", label: "Tổng tiền", type: "money", col: "total" },
        { key: "paid", label: "Đã thu", type: "money", col: "paid" },
        { key: "debt", label: "Còn nợ", type: "money" },
        { key: "discount", label: "Chiết khấu", type: "money", col: "discount" },
        { key: "salesChannel", label: "Kênh bán", type: "text", col: "salesChannel" },
        { key: "shipProvince", label: "Tỉnh / thành", type: "text", col: "shipProvince" },
        { key: "createdAt", label: "Ngày tạo", type: "date", col: "createdAt" },
        { key: "dueAt", label: "Hạn thanh toán", type: "date", col: "dueAt" },
      ];
    case "payments":
      return [
        { key: "orderNumber", label: "Số đơn", type: "text" },
        { key: "amount", label: "Số tiền", type: "money", col: "amount" },
        { key: "method", label: "Hình thức", type: "enum", col: "method", options: PAY_METHOD_OPTS },
        { key: "createdBy", label: "Người thu", type: "owner", col: "createdBy" },
        { key: "paidAt", label: "Ngày thu", type: "date", col: "paidAt" },
        { key: "createdAt", label: "Ngày ghi", type: "date", col: "createdAt" },
      ];
    case "calls":
      return [
        { key: "agentName", label: "Nhân viên gọi", type: "owner", col: "agentName" },
        { key: "outcome", label: "Kết quả", type: "enum", col: "outcome", options: CALL_OUTCOME_OPTS },
        { key: "direction", label: "Chiều gọi", type: "enum", col: "direction", options: opts({ out: "Gọi đi", in: "Gọi đến" }) },
        { key: "durationSec", label: "Thời lượng", type: "duration", col: "durationSec" },
        { key: "talked", label: "Có trao đổi", type: "bool" },
        { key: "aiScore", label: "Điểm AI", type: "number", col: "aiScore" },
        { key: "reviewScore", label: "Điểm chấm", type: "number", col: "reviewScore" },
        { key: "provider", label: "Tổng đài", type: "text", col: "provider" },
        { key: "startedAt", label: "Thời điểm gọi", type: "date", col: "startedAt" },
      ];
    case "tickets":
      return [
        { key: "subject", label: "Tiêu đề", type: "text", col: "subject" },
        { key: "status", label: "Trạng thái", type: "enum", col: "status", options: TICKET_STATUS_OPTS },
        { key: "priority", label: "Mức ưu tiên", type: "enum", col: "priority", options: TICKET_PRIORITY_OPTS },
        { key: "channel", label: "Kênh", type: "enum", col: "channel", options: TICKET_CHANNEL_OPTS },
        { key: "category", label: "Loại", type: "text", col: "category" },
        { key: "assignee", label: "Người xử lý", type: "owner", col: "assignee" },
        { key: "resolved", label: "Đã xử lý", type: "bool" },
        { key: "resolveHours", label: "Giờ xử lý", type: "number" },
        { key: "csat", label: "Điểm hài lòng", type: "number", col: "csat" },
        { key: "createdAt", label: "Ngày tạo", type: "date", col: "createdAt" },
        { key: "resolvedAt", label: "Ngày xử lý xong", type: "date", col: "resolvedAt" },
      ];
    case "conversations":
      return [
        { key: "channel", label: "Kênh", type: "enum", col: "channel", options: CONV_CHANNEL_OPTS },
        { key: "kind", label: "Loại", type: "enum", col: "kind", options: opts({ inbox: "Tin nhắn", comment: "Bình luận" }) },
        { key: "status", label: "Trạng thái", type: "enum", col: "status", options: opts({ open: "Đang mở", done: "Đã xong" }) },
        { key: "assignee", label: "Người phụ trách", type: "owner", col: "assignee" },
        { key: "source", label: "Nguồn", type: "enum", col: "source", options: opts({ "": "Trực tiếp", post: "Bài viết", ad: "Quảng cáo", website: "Website", ref: "Link giới thiệu" }) },
        { key: "sentiment", label: "Cảm xúc", type: "enum", col: "sentiment", options: opts({ "": "Bình thường", negative: "Tiêu cực", positive: "Tích cực" }) },
        { key: "quality", label: "Điểm chăm sóc", type: "number", col: "quality" },
        { key: "firstReplyMin", label: "Phút phản hồi đầu", type: "number" },
        { key: "orderMarked", label: "Đã lên đơn", type: "bool", col: "orderMarked" },
        { key: "createdAt", label: "Ngày bắt đầu", type: "date", col: "createdAt" },
        { key: "lastAt", label: "Tin cuối", type: "date", col: "lastAt" },
      ];
    case "activities":
      return [
        { key: "author", label: "Nhân viên", type: "owner", col: "author" },
        {
          key: "kind",
          label: "Loại hoạt động",
          type: "enum",
          col: "kind",
          options: opts({ update: "Cập nhật", call: "Cuộc gọi", message: "Tin nhắn", email_open: "Mở email", email_click: "Bấm email", sequence: "Kịch bản", sequence_reply: "Khách trả lời kịch bản", score: "Chấm điểm", ai: "AI", system: "Hệ thống" }),
        },
        { key: "objectKey", label: "Bảng", type: "enum", options: (cfg?.objects ?? []).map((o) => ({ key: o.key, label: o.label })) },
        { key: "recordTitle", label: "Mục", type: "text" },
        { key: "createdAt", label: "Thời điểm", type: "date", col: "createdAt" },
      ];
  }
}

export const datasetLabel = (ds: DatasetKey, cfg: WorkspaceConfig | null) =>
  ds === "contacts" || ds === "deals" ? cfg?.objects.find((o) => o.key === ds)?.label || DATASET_LABEL[ds] : DATASET_LABEL[ds];

// ───────────────────────────── Cấu hình báo cáo ─────────────────────────────

export const RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "last90", "this_week", "last_week", "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "all", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const RANGE_LABEL: Record<RangePreset, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  last7: "7 ngày qua",
  last30: "30 ngày qua",
  last90: "90 ngày qua",
  this_week: "Tuần này",
  last_week: "Tuần trước",
  this_month: "Tháng này",
  last_month: "Tháng trước",
  this_quarter: "Quý này",
  last_quarter: "Quý trước",
  this_year: "Năm nay",
  last_year: "Năm trước",
  all: "Toàn bộ thời gian",
  custom: "Tuỳ chọn",
};

export const FILTER_OPS = ["eq", "neq", "in", "contains", "gt", "gte", "lt", "lte", "empty", "not_empty"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export const FILTER_OP_LABEL: Record<FilterOp, string> = { eq: "bằng", neq: "khác", in: "thuộc", contains: "chứa", gt: ">", gte: "≥", lt: "<", lte: "≤", empty: "trống", not_empty: "có giá trị" };

export const BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const BUCKET_LABEL: Record<Bucket, string> = { day: "Ngày", week: "Tuần", month: "Tháng", quarter: "Quý", year: "Năm" };

export const METRIC_OPS = ["count", "sum", "avg", "min", "max", "rate"] as const;
export type MetricOp = (typeof METRIC_OPS)[number];
export const METRIC_LABEL: Record<MetricOp, string> = { count: "Số lượng", sum: "Tổng", avg: "Trung bình", min: "Nhỏ nhất", max: "Lớn nhất", rate: "Tỉ lệ" };

export const CHARTS = ["table", "bar", "line", "pie", "number"] as const;
export type ChartType = (typeof CHARTS)[number];
export const CHART_LABEL: Record<ChartType, string> = { table: "Bảng", bar: "Cột", line: "Đường", pie: "Tròn", number: "Số lớn" };

const FieldKey = z.string().regex(/^[a-zA-Z0-9_]{1,60}$/, "Trường không hợp lệ");
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

export const FilterSchema = z.object({
  field: FieldKey,
  op: z.enum(FILTER_OPS),
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(200)).max(50)]).optional(),
});
export const MetricSchema = z.object({ op: z.enum(METRIC_OPS), field: FieldKey.optional(), label: z.string().max(60).optional() });

export const ReportConfigSchema = z.object({
  dataset: z.enum(DATASETS),
  dateField: FieldKey.optional(),
  range: z.object({ preset: z.enum(RANGE_PRESETS), from: DateStr.optional(), to: DateStr.optional() }).default({ preset: "last30" }),
  filters: z.array(FilterSchema).max(12).default([]),
  groupBy: z.object({ field: FieldKey, bucket: z.enum(BUCKETS).optional() }).nullable().default(null),
  metrics: z.array(MetricSchema).min(1, "Chọn ít nhất một chỉ số").max(6).default([{ op: "count" }]),
  /** Chế độ danh sách (không nhóm): các cột hiển thị. */
  columns: z.array(FieldKey).max(15).default([]),
  sort: z.object({ by: z.string().regex(/^(label|m[0-5])$/), dir: z.enum(["asc", "desc"]) }).optional(),
  limit: z.number().int().min(1).max(1000).default(50),
  chart: z.enum(CHARTS).default("table"),
});
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type ReportFilter = z.infer<typeof FilterSchema>;
export type ReportMetric = z.infer<typeof MetricSchema>;

const NUMERIC: FieldType[] = ["number", "money", "duration"];

/**
 * Kiểm tra cấu hình theo danh mục trường của nguồn: trả cấu hình đã chuẩn hoá, hoặc câu lỗi tiếng Việt.
 * Mọi khoá trường lạ đều bị từ chối — engine chỉ dựng truy vấn từ các trường đã khai báo.
 */
export function validateConfig(input: unknown, cfg: WorkspaceConfig | null): { ok: true; config: ReportConfig } | { ok: false; error: string } {
  const p = ReportConfigSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Cấu hình báo cáo không hợp lệ" };
  const c = p.data;
  const fields = datasetFields(c.dataset, cfg);
  const get = (k: string) => fields.find((f) => f.key === k);
  if (c.dateField) {
    const f = get(c.dateField);
    if (!f || f.type !== "date") return { ok: false, error: "Trường ngày không hợp lệ" };
  } else {
    c.dateField = defaultDateField(c.dataset);
  }
  if (c.range.preset === "custom") {
    if (!c.range.from || !c.range.to) return { ok: false, error: "Chọn ngày bắt đầu và kết thúc" };
    if (c.range.from > c.range.to) return { ok: false, error: "Ngày bắt đầu phải trước ngày kết thúc" };
  }
  for (const flt of c.filters) {
    const f = get(flt.field);
    if (!f) return { ok: false, error: `Bộ lọc dùng trường không có: ${flt.field}` };
    if (["gt", "gte", "lt", "lte"].includes(flt.op) && !NUMERIC.includes(f.type) && f.type !== "date") return { ok: false, error: `Không so sánh lớn/nhỏ được với “${f.label}”` };
    if (flt.op === "contains" && f.type !== "text" && f.type !== "owner") return { ok: false, error: `“chứa” chỉ dùng cho trường chữ` };
  }
  if (c.groupBy) {
    const f = get(c.groupBy.field);
    if (!f) return { ok: false, error: "Trường nhóm theo không hợp lệ" };
    if (f.type === "date") c.groupBy.bucket ??= "day";
    else delete c.groupBy.bucket;
    if (NUMERIC.includes(f.type)) return { ok: false, error: "Không nhóm theo trường số" };
  }
  for (const m of c.metrics) {
    if (m.op === "count") {
      delete m.field;
      continue;
    }
    const f = m.field ? get(m.field) : undefined;
    if (!f) return { ok: false, error: `Chỉ số “${METRIC_LABEL[m.op]}” cần chọn trường` };
    if (m.op === "rate" ? f.type !== "bool" : !NUMERIC.includes(f.type)) return { ok: false, error: m.op === "rate" ? "Tỉ lệ chỉ tính trên trường có/không" : `Không tính ${METRIC_LABEL[m.op].toLowerCase()} trên “${f.label}”` };
  }
  for (const col of c.columns) if (!get(col)) return { ok: false, error: `Cột không hợp lệ: ${col}` };
  if (c.sort && c.sort.by !== "label" && Number(c.sort.by.slice(1)) >= c.metrics.length) c.sort = undefined;
  return { ok: true, config: c };
}

export function defaultDateField(ds: DatasetKey) {
  return ds === "calls" ? "startedAt" : ds === "payments" ? "paidAt" : "createdAt";
}

export const blankConfig = (ds: DatasetKey = "orders"): ReportConfig => ({
  dataset: ds,
  dateField: defaultDateField(ds),
  range: { preset: "last30" },
  filters: [],
  groupBy: null,
  metrics: [{ op: "count" }],
  columns: [],
  limit: 50,
  chart: "table",
});

// ───────────────────────────── Ngày theo giờ Việt Nam ─────────────────────────────

const VN = 7 * 3600e3; // UTC+7, không có giờ mùa hè
const D = 864e5;

/** Các phần ngày theo giờ Việt Nam. dow: 0 = Chủ nhật. */
export function vnParts(d: Date) {
  const x = new Date(d.getTime() + VN);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), dow: x.getUTCDay() };
}
/** 0h ngày y-m-d giờ Việt Nam (tháng/ngày tràn tự cuộn như Date.UTC). */
export const vnDate = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h) - VN);
const ymd = (d: Date) => {
  const p = vnParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};
const ddmmyyyy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export type DateRange = { from: Date | null; to: Date | null; label: string };

/** Khoảng thời gian [from, to) theo giờ Việt Nam. */
export function rangeOf(r: { preset: RangePreset; from?: string; to?: string }, now = new Date()): DateRange {
  const p = vnParts(now);
  const today = vnDate(p.y, p.m, p.d);
  const mondayOffset = (p.dow + 6) % 7;
  const q = Math.floor((p.m - 1) / 3);
  const mk = (from: Date | null, to: Date | null): DateRange => ({ from, to, label: from && to ? `${ddmmyyyy(ymd(from))} – ${ddmmyyyy(ymd(new Date(to.getTime() - 1)))}` : RANGE_LABEL[r.preset] });
  switch (r.preset) {
    case "today":
      return mk(today, new Date(today.getTime() + D));
    case "yesterday":
      return mk(new Date(today.getTime() - D), today);
    case "last7":
      return mk(new Date(today.getTime() - 6 * D), new Date(today.getTime() + D));
    case "last30":
      return mk(new Date(today.getTime() - 29 * D), new Date(today.getTime() + D));
    case "last90":
      return mk(new Date(today.getTime() - 89 * D), new Date(today.getTime() + D));
    case "this_week":
      return mk(vnDate(p.y, p.m, p.d - mondayOffset), vnDate(p.y, p.m, p.d - mondayOffset + 7));
    case "last_week":
      return mk(vnDate(p.y, p.m, p.d - mondayOffset - 7), vnDate(p.y, p.m, p.d - mondayOffset));
    case "this_month":
      return mk(vnDate(p.y, p.m, 1), vnDate(p.y, p.m + 1, 1));
    case "last_month":
      return mk(vnDate(p.y, p.m - 1, 1), vnDate(p.y, p.m, 1));
    case "this_quarter":
      return mk(vnDate(p.y, q * 3 + 1, 1), vnDate(p.y, q * 3 + 4, 1));
    case "last_quarter":
      return mk(vnDate(p.y, q * 3 - 2, 1), vnDate(p.y, q * 3 + 1, 1));
    case "this_year":
      return mk(vnDate(p.y, 1, 1), vnDate(p.y + 1, 1, 1));
    case "last_year":
      return mk(vnDate(p.y - 1, 1, 1), vnDate(p.y, 1, 1));
    case "custom": {
      const [fy, fm, fd] = (r.from ?? "").split("-").map(Number);
      const [ty, tm, td] = (r.to ?? "").split("-").map(Number);
      if (!fy || !ty) return { from: null, to: null, label: RANGE_LABEL.all };
      return mk(vnDate(fy, fm, fd), vnDate(ty, tm, td + 1));
    }
    default:
      return { from: null, to: null, label: RANGE_LABEL.all };
  }
}

/** Khoá (sắp xếp được) và nhãn của một mốc thời gian theo đơn vị nhóm. */
export function bucketOf(d: Date, unit: Bucket): { key: string; label: string } {
  const p = vnParts(d);
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  switch (unit) {
    case "day":
      return { key: `${p.y}-${mm}-${dd}`, label: `${dd}/${mm}` };
    case "week": {
      const mon = vnDate(p.y, p.m, p.d - ((p.dow + 6) % 7));
      const k = ymd(mon);
      return { key: k, label: `Tuần ${k.slice(8, 10)}/${k.slice(5, 7)}` };
    }
    case "month":
      return { key: `${p.y}-${mm}`, label: `T${p.m}/${p.y}` };
    case "quarter": {
      const qn = Math.floor((p.m - 1) / 3) + 1;
      return { key: `${p.y}-Q${qn}`, label: `Q${qn}/${p.y}` };
    }
    case "year":
      return { key: String(p.y), label: String(p.y) };
  }
}

/** Mọi mốc trong khoảng (để biểu đồ đường không bị hổng ngày trống). Tối đa 400 mốc. */
export function bucketsBetween(from: Date, to: Date, unit: Bucket): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  // Bước nhỏ hơn độ dài một mốc rồi gộp theo khoá: đúng với mọi đơn vị mà không cần lịch tháng/quý.
  const step = unit === "day" || unit === "week" ? D : unit === "month" ? 7 * D : unit === "quarter" ? 20 * D : 60 * D;
  for (let t = from.getTime(); t < to.getTime() && out.length <= 400; t += step) {
    const b = bucketOf(new Date(t), unit);
    if (!seen.has(b.key)) {
      seen.add(b.key);
      out.push(b);
    }
  }
  return out.length > 400 ? [] : out;
}

// ───────────────────────────── Lọc, nhóm, tính chỉ số ─────────────────────────────

export type RowValue = string | number | boolean | Date | null | undefined;
export type Row = Record<string, RowValue>;

const NONE = "(Trống)";
const UNASSIGNED = "(Chưa giao)";

/** Đổi giá trị bộ lọc sang kiểu của trường. */
export function coerce(f: FieldMeta, v: unknown): RowValue {
  if (v === undefined || v === null) return null;
  if (NUMERIC.includes(f.type)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (f.type === "date") {
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return vnDate(+m[1], +m[2], +m[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  if (f.type === "bool") return v === true || v === "1" || v === "true" || v === 1;
  return String(v);
}

const isEmpty = (v: RowValue) => v === null || v === undefined || v === "" || (v instanceof Date && isNaN(v.getTime()));
const num = (v: RowValue) => (v instanceof Date ? v.getTime() : typeof v === "boolean" ? (v ? 1 : 0) : Number(v));
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Một dòng có khớp bộ lọc không (chạy trong JS, cho trường tính / trường tuỳ biến). */
export function matchFilter(row: Row, flt: ReportFilter, f: FieldMeta): boolean {
  const v = row[flt.field];
  if (flt.op === "empty") return isEmpty(v);
  if (flt.op === "not_empty") return !isEmpty(v);
  if (flt.op === "in") {
    const list = Array.isArray(flt.value) ? flt.value : String(flt.value ?? "").split(",").map((s) => s.trim());
    return list.includes(String(v ?? ""));
  }
  if (flt.op === "contains") return fold(String(v ?? "")).includes(fold(String(flt.value ?? "")));
  const target = coerce(f, Array.isArray(flt.value) ? flt.value[0] : flt.value);
  if (flt.op === "eq" || flt.op === "neq") {
    let same: boolean;
    if (f.type === "bool") same = !!v === !!target;
    else if (f.type === "date") same = !isEmpty(v) && target instanceof Date && ymd(v as Date) === ymd(target);
    else if (NUMERIC.includes(f.type)) same = num(v) === num(target);
    else same = String(v ?? "") === String(target ?? "");
    return flt.op === "eq" ? same : !same;
  }
  if (isEmpty(v) || target === null) return false;
  let a = num(v);
  let b = num(target);
  // So sánh ngày: "≤ 2026-11-05" gồm cả ngày đó.
  if (f.type === "date" && (flt.op === "lte" || flt.op === "gt")) b += D - 1;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (f.type === "date") a = Math.floor(a);
  return flt.op === "gt" ? a > b : flt.op === "gte" ? a >= b : flt.op === "lt" ? a < b : a <= b;
}

/** Nhãn hiển thị của một giá trị theo kiểu trường. */
export function labelOf(f: FieldMeta, v: RowValue): string {
  if (f.type === "owner") return v ? String(v) : UNASSIGNED;
  if (f.type === "bool") return v ? "Có" : "Không";
  if (f.type === "enum") {
    const o = f.options?.find((x) => x.key === String(v ?? ""));
    return o?.label || (isEmpty(v) ? NONE : String(v));
  }
  if (f.type === "date") return isEmpty(v) ? NONE : ddmmyyyy(ymd(v as Date));
  return isEmpty(v) ? NONE : String(v);
}

export type ColKind = "text" | "number" | "money" | "percent" | "duration" | "date";
export type ResultColumn = { key: string; label: string; kind: ColKind };
export type Cell = string | number | null;
export type ReportResult = {
  mode: "group" | "list" | "total";
  columns: ResultColumn[];
  rows: Cell[][];
  /** Chỉ số tính trên toàn bộ dòng (dòng Tổng). */
  totals: (number | null)[];
  scanned: number;
  truncated: boolean;
  rangeLabel: string;
  hiddenGroups: number;
};

export function metricKind(m: ReportMetric, f: FieldMeta | undefined): ColKind {
  if (m.op === "count") return "number";
  if (m.op === "rate") return "percent";
  return f?.type === "money" ? "money" : f?.type === "duration" ? "duration" : "number";
}

export function metricLabel(m: ReportMetric, f: FieldMeta | undefined): string {
  if (m.label) return m.label;
  if (m.op === "count") return "Số lượng";
  if (m.op === "rate") return `Tỉ lệ ${f?.label.toLowerCase() ?? ""}`.trim();
  return `${METRIC_LABEL[m.op]} ${f?.label.toLowerCase() ?? ""}`.trim();
}

/** Tính một chỉ số trên tập dòng. */
export function computeMetric(rows: Row[], m: ReportMetric): number | null {
  if (m.op === "count") return rows.length;
  if (!m.field) return null;
  if (m.op === "rate") return rows.length ? Math.round((rows.filter((r) => !!r[m.field!]).length / rows.length) * 1000) / 10 : null;
  const vals = rows.map((r) => r[m.field!]).filter((v) => !isEmpty(v)).map(num).filter(Number.isFinite);
  if (!vals.length) return m.op === "sum" ? 0 : null;
  if (m.op === "sum") return vals.reduce((a, b) => a + b, 0);
  if (m.op === "avg") return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  if (m.op === "min") return Math.min(...vals);
  return Math.max(...vals);
}

/**
 * Từ các dòng đã lấy (đã áp phạm vi quyền) → bảng kết quả: lọc phần còn lại trong JS, nhóm theo trường hoặc
 * mốc thời gian, tính chỉ số, sắp xếp, cắt theo giới hạn.
 */
export function aggregate(all: Row[], c: ReportConfig, fields: FieldMeta[], opts: { range?: DateRange; truncated?: boolean; jsFilters?: ReportFilter[] } = {}): ReportResult {
  const get = (k: string) => fields.find((f) => f.key === k);
  const filters = opts.jsFilters ?? c.filters;
  let rows = all;
  for (const flt of filters) {
    const f = get(flt.field);
    if (f) rows = rows.filter((r) => matchFilter(r, flt, f));
  }
  const range = opts.range ?? { from: null, to: null, label: RANGE_LABEL[c.range.preset] };
  const mcols: ResultColumn[] = c.metrics.map((m, i) => {
    const f = m.field ? get(m.field) : undefined;
    return { key: `m${i}`, label: metricLabel(m, f), kind: metricKind(m, f) };
  });
  const totals = c.metrics.map((m) => computeMetric(rows, m));
  const base = { scanned: rows.length, truncated: !!opts.truncated, rangeLabel: range.label, totals, hiddenGroups: 0 };

  if (c.groupBy) {
    const gf = get(c.groupBy.field)!;
    const groups = new Map<string, { label: string; rows: Row[] }>();
    const bucket = gf.type === "date" ? c.groupBy.bucket ?? "day" : null;
    if (bucket && range.from && range.to) for (const b of bucketsBetween(range.from, range.to, bucket)) groups.set(b.key, { label: b.label, rows: [] });
    for (const r of rows) {
      const v = r[gf.key];
      let key: string;
      let label: string;
      if (bucket) {
        if (isEmpty(v)) {
          key = "~";
          label = NONE;
        } else ({ key, label } = bucketOf(v as Date, bucket));
      } else {
        key = gf.type === "bool" ? (v ? "1" : "0") : String(v ?? "");
        label = labelOf(gf, v);
      }
      const g = groups.get(key) ?? { label, rows: [] };
      g.rows.push(r);
      groups.set(key, g);
    }
    let list = [...groups.entries()].map(([key, g]) => ({ key, label: g.label, values: c.metrics.map((m) => computeMetric(g.rows, m)) }));
    const sort = c.sort ?? (bucket ? { by: "label", dir: "asc" as const } : { by: "m0", dir: "desc" as const });
    list.sort((a, b) => {
      let d: number;
      if (sort.by === "label") d = bucket ? a.key.localeCompare(b.key) : a.label.localeCompare(b.label, "vi");
      else {
        const i = Number(sort.by.slice(1));
        d = (a.values[i] ?? -Infinity) - (b.values[i] ?? -Infinity);
      }
      return sort.dir === "asc" ? d : -d;
    });
    const hidden = Math.max(0, list.length - c.limit);
    list = list.slice(0, c.limit);
    const gLabel = bucket ? `${gf.label} (${BUCKET_LABEL[bucket].toLowerCase()})` : gf.label;
    return { ...base, mode: "group", hiddenGroups: hidden, columns: [{ key: "label", label: gLabel, kind: "text" }, ...mcols], rows: list.map((g) => [g.label, ...g.values]) };
  }

  if (c.columns.length) {
    const cols = c.columns.map((k) => get(k)!).filter(Boolean);
    const df = c.dateField;
    const sorted = [...rows].sort((a, b) => num(b[df ?? "createdAt"]) - num(a[df ?? "createdAt"]));
    return {
      ...base,
      mode: "list",
      hiddenGroups: Math.max(0, sorted.length - c.limit),
      columns: cols.map((f) => ({ key: f.key, label: f.label, kind: f.type === "money" ? "money" : f.type === "duration" ? "duration" : f.type === "number" ? "number" : f.type === "date" ? "date" : "text" })),
      rows: sorted.slice(0, c.limit).map((r) =>
        cols.map((f) => {
          const v = r[f.key];
          if (NUMERIC.includes(f.type)) return isEmpty(v) ? null : num(v);
          if (f.type === "date") return isEmpty(v) ? null : (v as Date).toISOString();
          return labelOf(f, v);
        }),
      ),
    };
  }

  return { ...base, mode: "total", columns: mcols, rows: [totals] };
}

// ───────────────────────────── Định dạng ─────────────────────────────

export function fmtCell(v: Cell, kind: ColKind): string {
  if (v === null || v === undefined || v === "") return "–";
  if (kind === "text") return String(v);
  if (kind === "date") return ddmmyyyy(ymd(new Date(String(v))));
  const n = Number(v);
  if (kind === "percent") return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  if (kind === "money") return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
  if (kind === "duration") {
    const s = Math.round(n);
    return s >= 3600 ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút` : s >= 60 ? `${Math.floor(s / 60)} phút ${s % 60} giây` : `${s} giây`;
  }
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

// ───────────────────────────── Lịch gửi email ─────────────────────────────

export const ScheduleSchema = z.object({
  freq: z.enum(["off", "daily", "weekly", "monthly"]).default("off"),
  hour: z.number().int().min(0).max(23).default(8),
  /** 0 = Chủ nhật … 6 = Thứ bảy */
  weekday: z.number().int().min(0).max(6).default(1),
  /** Ngày trong tháng; quá số ngày của tháng thì gửi ngày cuối tháng. */
  day: z.number().int().min(1).max(31).default(1),
});
export type Schedule = z.infer<typeof ScheduleSchema>;
export const WEEKDAY_LABEL = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function parseSchedule(json: string | null | undefined): Schedule {
  try {
    const p = ScheduleSchema.safeParse(JSON.parse(json || "{}"));
    return p.success ? p.data : ScheduleSchema.parse({});
  } catch {
    return ScheduleSchema.parse({});
  }
}

export function scheduleLabel(s: Schedule) {
  const h = `${String(s.hour).padStart(2, "0")}:00`;
  if (s.freq === "daily") return `Hằng ngày lúc ${h}`;
  if (s.freq === "weekly") return `${WEEKDAY_LABEL[s.weekday]} hằng tuần lúc ${h}`;
  if (s.freq === "monthly") return `Ngày ${s.day} hằng tháng lúc ${h}`;
  return "Không gửi tự động";
}

/** Lần gửi theo lịch gần nhất đã tới (≤ now). null = tắt. */
export function lastSlot(s: Schedule, now = new Date()): Date | null {
  if (s.freq === "off") return null;
  const p = vnParts(now);
  if (s.freq === "daily") {
    const t = vnDate(p.y, p.m, p.d, s.hour);
    return t <= now ? t : vnDate(p.y, p.m, p.d - 1, s.hour);
  }
  if (s.freq === "weekly") {
    const back = (p.dow - s.weekday + 7) % 7;
    const t = vnDate(p.y, p.m, p.d - back, s.hour);
    return t <= now ? t : vnDate(p.y, p.m, p.d - back - 7, s.hour);
  }
  const dayIn = (y: number, m: number) => Math.min(s.day, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const t = vnDate(p.y, p.m, dayIn(p.y, p.m), s.hour);
  if (t <= now) return t;
  const pm = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
  return vnDate(pm.y, pm.m, dayIn(pm.y, pm.m), s.hour);
}

/** Cửa sổ bù gửi: máy chủ tắt quá lâu thì bỏ qua kỳ đó thay vì gửi muộn cả ngày. */
export const CATCH_UP_MS = 3 * 3600e3;

/**
 * Báo cáo có tới hạn gửi không: mỗi kỳ (slot) gửi đúng một lần — idempotent nhờ lastSentAt ≥ slot.
 * Không gửi bù kỳ đã trôi quá CATCH_UP_MS, và không gửi kỳ có trước khi báo cáo được tạo.
 */
export function isDue(s: Schedule, lastSentAt: Date | null, createdAt: Date, now = new Date()): Date | null {
  const slot = lastSlot(s, now);
  if (!slot) return null;
  if (now.getTime() - slot.getTime() > CATCH_UP_MS) return null;
  if (createdAt > slot) return null;
  if (lastSentAt && lastSentAt >= slot) return null;
  return slot;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function parseRecipients(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && EMAIL_RE.test(x)) : [];
  } catch {
    return [];
  }
}
