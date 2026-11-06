// Nhãn, màu và quy tắc trạng thái dùng chung client/server cho báo giá, đơn hàng, hợp đồng.
import type { Tone } from "@/components/ui/Badge";

export type QuoteStatus = "draft" | "pending" | "approved" | "sent" | "accepted" | "rejected" | "expired";
export type OrderStatus = "new" | "confirmed" | "shipping" | "done" | "cancelled";
export type ContractStatus = "draft" | "active" | "expired" | "cancelled";
export type PayMethod = "cash" | "transfer" | "card" | "other";

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: Tone }> = {
  draft: { label: "Nháp", tone: "neutral" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "info" },
  sent: { label: "Đã gửi", tone: "accent" },
  accepted: { label: "Khách đồng ý", tone: "success" },
  rejected: { label: "Khách từ chối", tone: "danger" },
  expired: { label: "Hết hạn", tone: "neutral" },
};
export const QUOTE_STATUSES = Object.keys(QUOTE_STATUS) as QuoteStatus[];

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  new: { label: "Mới", tone: "info" },
  confirmed: { label: "Đã xác nhận", tone: "accent" },
  shipping: { label: "Đang giao", tone: "warning" },
  done: { label: "Hoàn tất", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
};
export const ORDER_STATUSES = Object.keys(ORDER_STATUS) as OrderStatus[];
/** Bước kế tiếp hợp lệ của đơn. Huỷ được khi chưa hoàn tất; hoàn tất rồi không đổi nữa. */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "shipping", "done", "cancelled"],
  confirmed: ["shipping", "done", "cancelled"],
  shipping: ["done", "cancelled"],
  done: [],
  cancelled: ["new"],
};

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  draft: { label: "Nháp", tone: "neutral" },
  active: { label: "Hiệu lực", tone: "success" },
  expired: { label: "Hết hạn", tone: "warning" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
};
export const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS) as ContractStatus[];

export const PAY_METHOD: Record<PayMethod, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản", card: "Thẻ", other: "Khác" };
export const PAY_METHODS = Object.keys(PAY_METHOD) as PayMethod[];

/** Báo giá còn mở mà quá hạn hiệu lực thì coi như hết hạn (không cần job đổi trạng thái). */
export function quoteExpired(q: { status: string; validUntil: Date | string | null }) {
  if (!q.validUntil || !["draft", "pending", "approved", "sent"].includes(q.status)) return false;
  return new Date(q.validUntil).getTime() < startOfToday();
}
export const quoteStatusOf = (q: { status: string; validUntil: Date | string | null }): QuoteStatus => (quoteExpired(q) ? "expired" : (q.status as QuoteStatus));

/** Hiệu lực tính hết ngày validUntil. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Số ngày còn lại tới một mốc (âm = đã qua), theo ngày lịch. */
export function daysLeft(d: Date | string | null | undefined) {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - startOfToday()) / 864e5);
}

export const remaining = (o: { total: number; paid: number; status?: string }) => (o.status === "cancelled" ? 0 : Math.max(0, Math.round(o.total - o.paid)));
export const overdue = (o: { total: number; paid: number; status?: string; dueAt: Date | string | null }) => remaining(o) > 0 && !!o.dueAt && new Date(o.dueAt).getTime() < Date.now();

/** Tiền đầy đủ cho chứng từ: 1.250.000 ₫ */
export const money = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;

/** Ngày dd/mm/yyyy. */
export function dmy(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "" : x.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
/** Ngày dạng YYYY-MM-DD cho <input type="date">. */
export function ymd(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

/** So khớp không dấu, không phân biệt hoa thường. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Trạng thái khách được xem qua link công khai (nháp/chờ duyệt thì chưa cho xem). */
export const PUBLIC_QUOTE_STATUSES = ["approved", "sent", "accepted", "rejected", "expired"];

/** Kiểu sau khi qua JSON (Date → string) để truyền từ trang server xuống client. */
export type Ser<T> = T extends Date ? string : T extends (infer U)[] ? Ser<U>[] : T extends object ? { [K in keyof T]: Ser<T[K]> } : T;
export const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as Ser<T>;
