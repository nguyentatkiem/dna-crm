// Danh mục widget dùng chung cho trình duyệt và server (không import db).
import { z } from "zod";

export const PALETTE = ["#0073ea", "#00c875", "#fdab3d", "#df2f4a", "#a25ddc", "#579bfc", "#ff642e", "#9cd326"];

export const WIDGET_TYPES = ["kpi", "bar", "line", "area", "pie", "donut", "funnel", "leaderboard", "table", "goal", "overdue", "activity"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const KPI_KEYS = ["won_revenue", "pipeline_value", "new_contacts", "win_rate", "calls", "avg_call_score", "ad_spend", "roas", "unread"] as const;
export type KpiKey = (typeof KPI_KEYS)[number];
export const SERIES_KEYS = ["new_contacts_daily", "revenue_weekly", "calls_daily", "ad_spend_daily"] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];
export const GROUP_KEYS = ["status", "source", "channel", "owner"] as const;
export const RANK_KEYS = ["revenue", "calls", "score"] as const;
export const RANGES = ["7d", "30d", "90d", "month", "quarter", "all"] as const;
export type RangeKey = (typeof RANGES)[number];

export const WidgetConfig = z.object({
  metric: z.enum(KPI_KEYS).optional(),
  series: z.enum(SERIES_KEYS).optional(),
  groupBy: z.enum(GROUP_KEYS).optional(),
  measure: z.enum(["count", "amount"]).optional(),
  rankBy: z.enum(RANK_KEYS).optional(),
  objectKey: z.string().max(40).optional(),
  range: z.enum(RANGES).optional(),
  owner: z.string().max(80).optional(),
  channel: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  target: z.number().min(0).optional(),
  sort: z.enum(["amount", "score", "createdAt"]).optional(),
});
export type WidgetConfig = z.infer<typeof WidgetConfig>;

export const Widget = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(WIDGET_TYPES),
  title: z.string().max(80),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(500),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(10),
  config: WidgetConfig,
});
export type Widget = z.infer<typeof Widget>;

export const KPI_LABEL: Record<KpiKey, string> = {
  won_revenue: "Doanh thu chốt",
  pipeline_value: "Giá trị pipeline",
  new_contacts: "Khách mới",
  win_rate: "Tỉ lệ chốt",
  calls: "Số cuộc gọi",
  avg_call_score: "Điểm gọi trung bình",
  ad_spend: "Chi phí quảng cáo",
  roas: "ROAS",
  unread: "Tin chưa đọc",
};
export const SERIES_LABEL: Record<SeriesKey, string> = {
  new_contacts_daily: "Khách mới theo ngày",
  revenue_weekly: "Doanh thu theo tuần",
  calls_daily: "Cuộc gọi theo ngày",
  ad_spend_daily: "Chi phí QC theo ngày",
};
export const GROUP_LABEL: Record<(typeof GROUP_KEYS)[number], string> = { status: "Trạng thái", source: "Nguồn khách", channel: "Kênh", owner: "Người phụ trách" };
export const RANK_LABEL: Record<(typeof RANK_KEYS)[number], string> = { revenue: "Doanh thu", calls: "Số cuộc gọi", score: "Điểm gọi TB" };
export const RANGE_LABEL: Record<RangeKey, string> = { "7d": "7 ngày", "30d": "30 ngày", "90d": "90 ngày", month: "Tháng này", quarter: "Quý này", all: "Toàn bộ" };

/** Thư viện widget: nhãn, mô tả, kích thước và cấu hình mặc định khi kéo vào. */
export const LIBRARY: { type: WidgetType; label: string; hint: string; icon: string; w: number; h: number; config: WidgetConfig; title: string }[] = [
  { type: "kpi", label: "Chỉ số", hint: "Số lớn + so với kỳ trước", icon: "trend", w: 3, h: 2, config: { metric: "won_revenue", range: "30d" }, title: "Doanh thu chốt" },
  { type: "bar", label: "Cột", hint: "Theo ngày / tuần", icon: "chart", w: 6, h: 4, config: { series: "new_contacts_daily", range: "30d" }, title: "Khách mới theo ngày" },
  { type: "line", label: "Đường", hint: "Xu hướng theo thời gian", icon: "trend", w: 6, h: 4, config: { series: "calls_daily", range: "30d" }, title: "Cuộc gọi theo ngày" },
  { type: "area", label: "Vùng", hint: "Xu hướng có tô nền", icon: "chart", w: 6, h: 4, config: { series: "revenue_weekly", range: "90d" }, title: "Doanh thu theo tuần" },
  { type: "pie", label: "Tròn", hint: "Tỉ trọng theo nhóm", icon: "pie", w: 4, h: 4, config: { groupBy: "source", objectKey: "contacts", range: "all" }, title: "Khách theo nguồn" },
  { type: "donut", label: "Vành khuyên", hint: "Tỉ trọng có số tổng", icon: "pie", w: 4, h: 4, config: { groupBy: "status", objectKey: "deals", range: "all" }, title: "Giao dịch theo trạng thái" },
  { type: "funnel", label: "Phễu", hint: "Số mục ở từng giai đoạn", icon: "filter", w: 6, h: 4, config: { range: "all" }, title: "Phễu bán hàng" },
  { type: "leaderboard", label: "Bảng xếp hạng", hint: "Nhân viên dẫn đầu", icon: "target", w: 4, h: 4, config: { rankBy: "revenue", range: "30d", limit: 5 }, title: "Top doanh thu" },
  { type: "table", label: "Bảng", hint: "Top N mục theo bộ lọc", icon: "table", w: 6, h: 4, config: { objectKey: "deals", sort: "amount", limit: 6, range: "all" }, title: "Giao dịch lớn nhất" },
  { type: "goal", label: "Mục tiêu", hint: "Thanh tiến độ tháng", icon: "target", w: 4, h: 2, config: { metric: "won_revenue", range: "month", target: 100_000_000 }, title: "Mục tiêu doanh thu tháng" },
  { type: "overdue", label: "Việc quá hạn", hint: "Danh sách cần xử lý", icon: "clock", w: 4, h: 4, config: { limit: 8 }, title: "Việc quá hạn" },
  { type: "activity", label: "Hoạt động", hint: "Cập nhật mới nhất", icon: "history", w: 4, h: 4, config: { limit: 10 }, title: "Hoạt động gần đây" },
];

export const libraryOf = (t: WidgetType) => LIBRARY.find((l) => l.type === t) ?? LIBRARY[0];

/** Xếp widget vào lưới 12 cột theo thứ tự, lấp chỗ trống đầu tiên vừa (giống grid dense). */
export function pack<T extends { w: number; h: number }>(items: T[]): (T & { x: number; y: number })[] {
  const rows: boolean[][] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) if (rows[r]?.[c]) return false;
    return true;
  };
  return items.map((it) => {
    const w = Math.max(1, Math.min(12, it.w));
    for (let y = 0; ; y++) {
      for (let x = 0; x + w <= 12; x++) {
        if (free(x, y, w, it.h)) {
          for (let r = y; r < y + it.h; r++) {
            rows[r] ??= [];
            for (let c = x; c < x + w; c++) rows[r][c] = true;
          }
          return { ...it, w, x, y };
        }
      }
    }
  });
}

let n = 0;
export const newId = () => `w${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Spec = Omit<Widget, "id" | "x" | "y">;
const k = (metric: KpiKey, title: string, range: RangeKey = "30d"): Spec => ({ type: "kpi", title, w: 3, h: 2, config: { metric, range } });

/** 3 dashboard mẫu dựng sẵn: dùng khi tạo dữ liệu mẫu và khi AI không chạy được. */
export const TEMPLATES: { key: "sales" | "telesales" | "marketing"; name: string; keywords: RegExp; widgets: Spec[] }[] = [
  {
    key: "sales",
    name: "Tổng quan kinh doanh",
    keywords: /kinh doanh|tổng quan|giám đốc|ceo|chủ|doanh thu|bán hàng|sales|pipeline/i,
    widgets: [
      k("won_revenue", "Doanh thu chốt"),
      k("pipeline_value", "Giá trị pipeline"),
      k("new_contacts", "Khách mới"),
      k("win_rate", "Tỉ lệ chốt"),
      { type: "area", title: "Doanh thu theo tuần", w: 8, h: 4, config: { series: "revenue_weekly", range: "90d" } },
      { type: "goal", title: "Mục tiêu doanh thu tháng", w: 4, h: 2, config: { metric: "won_revenue", range: "month", target: 100_000_000 } },
      { type: "goal", title: "Mục tiêu khách mới tháng", w: 4, h: 2, config: { metric: "new_contacts", range: "month", target: 50 } },
      { type: "funnel", title: "Phễu bán hàng", w: 6, h: 4, config: { range: "all" } },
      { type: "leaderboard", title: "Top doanh thu", w: 6, h: 4, config: { rankBy: "revenue", range: "90d", limit: 5 } },
      { type: "table", title: "Giao dịch lớn nhất", w: 8, h: 4, config: { objectKey: "deals", sort: "amount", limit: 6, range: "all" } },
      { type: "overdue", title: "Việc quá hạn", w: 4, h: 4, config: { limit: 8 } },
    ],
  },
  {
    key: "telesales",
    name: "Telesales",
    keywords: /telesale|gọi|cuộc gọi|call|tổng đài|chăm sóc|cskh/i,
    widgets: [
      k("calls", "Số cuộc gọi", "7d"),
      k("avg_call_score", "Điểm gọi trung bình", "7d"),
      k("new_contacts", "Khách mới", "7d"),
      k("win_rate", "Tỉ lệ chốt"),
      { type: "line", title: "Cuộc gọi theo ngày", w: 8, h: 4, config: { series: "calls_daily", range: "30d" } },
      { type: "leaderboard", title: "Điểm gọi theo nhân viên", w: 4, h: 4, config: { rankBy: "score", range: "30d", limit: 6 } },
      { type: "leaderboard", title: "Nhân viên gọi nhiều nhất", w: 4, h: 4, config: { rankBy: "calls", range: "30d", limit: 6 } },
      { type: "donut", title: "Khách theo trạng thái", w: 4, h: 4, config: { groupBy: "status", objectKey: "contacts", range: "all" } },
      { type: "overdue", title: "Việc gọi lại quá hạn", w: 4, h: 4, config: { limit: 8 } },
      { type: "table", title: "Khách nóng cần gọi", w: 8, h: 4, config: { objectKey: "contacts", sort: "score", limit: 8, range: "all" } },
      { type: "activity", title: "Hoạt động gần đây", w: 4, h: 4, config: { limit: 10 } },
    ],
  },
  {
    key: "marketing",
    name: "Marketing & ROAS",
    keywords: /marketing|quảng cáo|ads|roas|chiến dịch|kênh|nguồn|facebook|tiktok|google/i,
    widgets: [
      k("ad_spend", "Chi phí quảng cáo"),
      k("roas", "ROAS"),
      k("new_contacts", "Khách mới"),
      k("unread", "Tin chưa đọc", "all"),
      { type: "bar", title: "Chi phí QC theo ngày", w: 6, h: 4, config: { series: "ad_spend_daily", range: "30d" } },
      { type: "bar", title: "Khách mới theo ngày", w: 6, h: 4, config: { series: "new_contacts_daily", range: "30d" } },
      { type: "pie", title: "Khách theo nguồn", w: 4, h: 4, config: { groupBy: "source", objectKey: "contacts", range: "all" } },
      { type: "donut", title: "Khách theo kênh", w: 4, h: 4, config: { groupBy: "channel", objectKey: "contacts", range: "all" } },
      { type: "goal", title: "Mục tiêu lead tháng", w: 4, h: 2, config: { metric: "new_contacts", range: "month", target: 60 } },
      { type: "kpi", title: "Doanh thu chốt", w: 4, h: 2, config: { metric: "won_revenue", range: "30d" } },
    ],
  },
];

export function buildWidgets(specs: Spec[]): Widget[] {
  return pack(specs.map((s) => ({ ...s, id: newId() })));
}

export function matchTemplate(text: string) {
  // Xét mẫu chuyên biệt trước ("telesales" chứa chữ "sales").
  return [TEMPLATES[1], TEMPLATES[2], TEMPLATES[0]].find((t) => t.keywords.test(text)) ?? TEMPLATES[0];
}

// ---------- Kiểu dữ liệu widget đã tính (server trả về) ----------
export type Fmt = "money" | "number" | "percent" | "ratio" | "score";
export type WidgetData =
  | { kind: "kpi"; value: number; prev: number | null; delta: number | null; format: Fmt; hint: string }
  | { kind: "series"; points: { label: string; value: number }[]; format: Fmt; total: number }
  | { kind: "slices"; slices: { name: string; value: number; color: string }[]; format: Fmt; total: number }
  | { kind: "funnel"; stages: { name: string; count: number; amount: number; color: string }[] }
  | { kind: "leaderboard"; rows: { name: string; value: number; sub: string }[]; format: Fmt }
  | { kind: "table"; objectKey: string; rows: { id: string; title: string; status: string; statusColor: string; owner: string; amount: number; score: number; createdAt: string }[]; amountLabel: string }
  | { kind: "goal"; value: number; target: number; pct: number; format: Fmt; daysLeft: number }
  | { kind: "tasks"; items: { id: string; title: string; dueAt: string; assignee: string; recordId: string | null; days: number }[]; total: number }
  | { kind: "feed"; items: { id: string; body: string; author: string; at: string; recordId: string; recordTitle: string; objectKey: string; kind: string }[] }
  | { kind: "error"; message: string };

export function fmtValue(v: number, f: Fmt) {
  if (f === "percent") return `${Math.round(v)}%`;
  if (f === "ratio") return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}x`;
  if (f === "score") return v ? v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—";
  if (f === "money") {
    if (!v) return "0";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tỷ";
    if (a >= 1e6) return (v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr";
    if (a >= 1e3) return Math.round(v / 1e3).toLocaleString("vi-VN") + "k";
  }
  return Math.round(v).toLocaleString("vi-VN");
}
