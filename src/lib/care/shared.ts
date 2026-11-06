// Hằng số và hàm thuần của phần Chăm sóc sau bán. Không import server, dùng được cả trình duyệt lẫn kiểm thử.

// ---------------- Phiếu hỗ trợ ----------------
export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = { open: "Mở", pending: "Đang chờ khách", resolved: "Đã xử lý", closed: "Đóng" };
export const TICKET_STATUS_TONE: Record<TicketStatus, "info" | "warning" | "success" | "neutral"> = { open: "info", pending: "warning", resolved: "success", closed: "neutral" };

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp" };
export const PRIORITY_COLOR: Record<Priority, string> = { urgent: "#df2f4a", high: "#fdab3d", normal: "#579bfc", low: "#a0a3b1" };

export const CHANNELS = ["manual", "inbox", "call", "form", "email"] as const;
export const CHANNEL_LABEL: Record<string, string> = { manual: "Nhập tay", inbox: "Hộp thư", call: "Cuộc gọi", form: "Biểu mẫu", email: "Email" };

export type TicketPref = { slaHours: Record<Priority, number> };
export const TICKET_DEFAULT: TicketPref = { slaHours: { urgent: 4, high: 8, normal: 24, low: 72 } };

/** Hạn xử lý theo SLA: giờ tạo + số giờ của mức ưu tiên. 0 giờ = không đặt hạn. */
export function slaDueAt(priority: Priority, pref: TicketPref, from = new Date()): Date | null {
  const h = Number(pref.slaHours?.[priority] ?? TICKET_DEFAULT.slaHours[priority]);
  if (!Number.isFinite(h) || h <= 0) return null;
  return new Date(from.getTime() + h * 3600e3);
}

/** Phiếu quá hạn: có hạn, đã qua hạn và chưa xử lý xong. */
export const isOverdue = (t: { dueAt: Date | string | null; status: string }, now = Date.now()) => !!t.dueAt && (t.status === "open" || t.status === "pending") && new Date(t.dueAt).getTime() < now;

// ---------------- Tích điểm ----------------
export type Tier = { name: string; minPoints: number; discountPct: number; color: string };
export type Reward = { name: string; points: number };
export type LoyaltyPref = { enabled: boolean; vndPerPoint: number; tiers: Tier[]; rewards: Reward[] };
export const LOYALTY_DEFAULT: LoyaltyPref = {
  enabled: true,
  vndPerPoint: 10000,
  tiers: [
    { name: "Thành viên", minPoints: 0, discountPct: 0, color: "#a0a3b1" },
    { name: "Bạc", minPoints: 500, discountPct: 3, color: "#8f9bb3" },
    { name: "Vàng", minPoints: 2000, discountPct: 5, color: "#e2a400" },
    { name: "Kim cương", minPoints: 5000, discountPct: 10, color: "#2fa3d6" },
  ],
  rewards: [
    { name: "Voucher 50.000đ", points: 100 },
    { name: "Gội dưỡng sinh miễn phí", points: 300 },
    { name: "Liệu trình chăm sóc da", points: 1000 },
  ],
};

/** Điểm của một đơn: làm tròn xuống theo số tiền mỗi điểm. */
export function pointsFor(total: number, vndPerPoint: number) {
  if (!(vndPerPoint > 0) || !(total > 0)) return 0;
  return Math.floor(total / vndPerPoint);
}

/**
 * Hạng tính theo tổng điểm đã TÍCH (chỉ cộng các giao dịch dương), không theo số dư:
 * khách đổi quà không bị tụt hạng. Lấy hạng có minPoints cao nhất mà khách đạt.
 */
export function tierFor(earned: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  let t = sorted[0] ?? LOYALTY_DEFAULT.tiers[0];
  for (const x of sorted) if (earned >= x.minPoints) t = x;
  return t;
}

/** Hạng kế tiếp và số điểm còn thiếu (null nếu đã ở hạng cao nhất). */
export function nextTier(earned: number, tiers: Tier[]): { tier: Tier; need: number } | null {
  const up = [...tiers].sort((a, b) => a.minPoints - b.minPoints).find((x) => x.minPoints > earned);
  return up ? { tier: up, need: up.minPoints - earned } : null;
}

/** Tổng hợp sổ điểm: số dư, điểm đã tích, lần cuối có giao dịch. */
export function summarize(txns: { points: number; createdAt: Date | string }[]) {
  let balance = 0;
  let earned = 0;
  let last = 0;
  for (const t of txns) {
    balance += t.points;
    if (t.points > 0) earned += t.points;
    last = Math.max(last, new Date(t.createdAt).getTime());
  }
  return { balance, earned, lastAt: last ? new Date(last).toISOString() : null };
}

// ---------------- Bảo hành ----------------
export const WARRANTY_STATUS_LABEL: Record<string, string> = { active: "Còn hạn", claimed: "Đã yêu cầu", expired: "Hết hạn", void: "Đã huỷ" };
export const WARRANTY_STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = { active: "success", claimed: "warning", expired: "neutral", void: "danger" };
/** Số ngày coi là "sắp hết hạn". */
export const EXPIRING_DAYS = 30;
/** Đơn có số lượng lớn: tạo tối đa chừng này phiếu cho một dòng hàng, phần còn lại ghi chú. */
export const MAX_UNITS_PER_LINE = 20;

/** Cộng tháng, giữ ngày cuối tháng hợp lệ (31/1 + 1 tháng = 28 hoặc 29/2). */
export function addMonths(d: Date, months: number) {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

/** Chuẩn hoá SĐT Việt Nam về dạng 0xxxxxxxxx để so khớp. */
export function normPhone(p: string) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  return d;
}

/** Che bớt số serial khi hiển thị công khai: giữ 2 ký tự đầu và 3 ký tự cuối. */
export function maskSerial(s: string) {
  if (!s) return "";
  if (s.length <= 5) return s[0] + "•".repeat(Math.max(1, s.length - 1));
  return s.slice(0, 2) + "•".repeat(Math.min(8, s.length - 5)) + s.slice(-3);
}

export const daysLeft = (endAt: Date | string, now = Date.now()) => Math.ceil((new Date(endAt).getTime() - now) / 864e5);
