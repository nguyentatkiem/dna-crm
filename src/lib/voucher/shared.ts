// Voucher: sinh mã, tính tiền giảm, kiểm tra điều kiện dùng. Thuần, dùng được cả client lẫn server.
import { z } from "zod";

/** Bảng chữ không có ký tự dễ nhầm (0/O, 1/I/L, 5/S, 2/Z, 8/B). */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

export const VOUCHER_STATUSES = ["issued", "used", "expired", "void"] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];
export const VOUCHER_STATUS_LABEL: Record<VoucherStatus, string> = { issued: "Chưa dùng", used: "Đã dùng", expired: "Hết hạn", void: "Đã huỷ" };
export const VOUCHER_STATUS_TONE: Record<VoucherStatus, "info" | "success" | "neutral" | "danger"> = { issued: "info", used: "success", expired: "neutral", void: "danger" };

export const SEND_CHANNELS = ["", "zalo", "zns", "sms", "email"] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];
export const SEND_LABEL: Record<SendChannel, string> = { "": "Không gửi", zalo: "Zalo OA", zns: "Zalo ZNS", sms: "SMS", email: "Email" };

export type CampaignLike = { kind: string; value: number; maxDiscount: number; minOrder: number };

/** Chuẩn hoá tiền tố: chữ in hoa, số; tối đa 8 ký tự. */
export const cleanPrefix = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

/** Chuẩn hoá mã khách gõ: bỏ khoảng trắng, gạch, in hoa. */
export const normCode = (c: string) => String(c ?? "").toUpperCase().replace(/[\s-]/g, "");

/** Mã = tiền tố + 6 ký tự ngẫu nhiên không dễ nhầm. `rand` trả số trong [0,1) (truyền vào để kiểm thử). */
export function generateCode(prefix: string, rand: () => number = Math.random, len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return cleanPrefix(prefix) + s;
}

/** Sinh mã chưa có trong `taken` (thử tối đa 20 lần, sau đó dài thêm). */
export function uniqueCode(prefix: string, taken: (code: string) => boolean, rand: () => number = Math.random) {
  for (let i = 0; i < 20; i++) {
    const c = generateCode(prefix, rand);
    if (!taken(c)) return c;
  }
  return generateCode(prefix, rand, 10);
}

/**
 * Số tiền giảm cho đơn có tạm tính `subtotal` (đồng).
 * - Chưa đạt giá trị tối thiểu → 0.
 * - percent: subtotal × value%, kẹp theo maxDiscount nếu > 0.
 * - amount: value.
 * Không bao giờ vượt subtotal, làm tròn về đồng.
 */
export function computeDiscount(c: CampaignLike, subtotal: number) {
  const sub = Math.max(0, Math.round(Number(subtotal) || 0));
  if (!sub || sub < (c.minOrder || 0)) return 0;
  let d = c.kind === "percent" ? (sub * Math.min(100, Math.max(0, c.value))) / 100 : Math.max(0, c.value);
  if (c.kind === "percent" && c.maxDiscount > 0) d = Math.min(d, c.maxDiscount);
  return Math.min(sub, Math.round(d));
}

/** Mô tả ngắn giá trị voucher: "Giảm 10% (tối đa 200.000đ)" / "Giảm 50.000đ". */
export function valueText(c: CampaignLike) {
  const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
  const head = c.kind === "percent" ? `Giảm ${c.value}%${c.maxDiscount > 0 ? ` (tối đa ${money(c.maxDiscount)})` : ""}` : `Giảm ${money(c.value)}`;
  return c.minOrder > 0 ? `${head}, đơn từ ${money(c.minOrder)}` : head;
}

/** Trạng thái thực tế: còn "issued" nhưng đã qua hạn thì coi là hết hạn. */
export function effectiveStatus(v: { status: string; expiresAt: Date | string }, now = new Date()): VoucherStatus {
  if (v.status === "issued" && new Date(v.expiresAt).getTime() < now.getTime()) return "expired";
  return (VOUCHER_STATUSES as readonly string[]).includes(v.status) ? (v.status as VoucherStatus) : "issued";
}

export type CheckInput = {
  voucher: { status: string; expiresAt: Date | string; recordId: string | null; usedOrderId?: string | null } | null;
  campaign: (CampaignLike & { active: boolean }) | null;
  subtotal: number;
  contactId?: string | null;
  /** Đơn đang sửa: voucher đã gắn với chính đơn này thì vẫn hợp lệ. */
  orderId?: string | null;
  now?: Date;
};

/** Kiểm tra voucher dùng được cho đơn không. Trả { discount } hoặc { error } (tiếng Việt). */
export function checkVoucher(i: CheckInput): { discount: number } | { error: string } {
  const { voucher: v, campaign: c } = i;
  if (!v || !c) return { error: "Mã giảm giá không tồn tại" };
  const own = !!i.orderId && v.usedOrderId === i.orderId;
  if (v.status === "used" && !own) return { error: "Mã này đã được sử dụng" };
  if (v.status === "void") return { error: "Mã này đã bị huỷ" };
  if (!own && effectiveStatus(v, i.now) === "expired") return { error: "Mã đã hết hạn" };
  if (!c.active && !own) return { error: "Chương trình khuyến mãi đã tạm dừng" };
  if (v.recordId && i.contactId && v.recordId !== i.contactId) return { error: "Mã này được phát cho khách khác" };
  if (v.recordId && !i.contactId) return { error: "Mã này dành riêng cho một khách, hãy chọn đúng khách trước" };
  if (c.minOrder > 0 && i.subtotal < c.minOrder) return { error: `Đơn cần tối thiểu ${Math.round(c.minOrder).toLocaleString("vi-VN")}đ để dùng mã` };
  const discount = computeDiscount(c, i.subtotal);
  if (!discount) return { error: "Mã không áp dụng được cho đơn này" };
  return { discount };
}

/** Điền {code} {value} {expiresAt} {name} vào mẫu tin. */
export function fillVoucherTemplate(tpl: string, v: { code: string; value: string; expiresAt: Date | string; name: string }) {
  const d = new Date(v.expiresAt);
  const exp = isNaN(d.getTime()) ? "" : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const map: Record<string, string> = { code: v.code, value: v.value, expiresAt: exp, name: v.name };
  return tpl.replace(/\{(code|value|expiresAt|name)\}/g, (_, k: string) => map[k]);
}

export const DEFAULT_TEMPLATE = "Chào {name}, tặng bạn mã {code}: {value}. Hạn dùng đến {expiresAt}. Hẹn gặp bạn sớm!";

export const CampaignInput = z.object({
  name: z.string().trim().min(1, "Cần nhập tên chương trình").max(120),
  prefix: z.string().max(20).transform(cleanPrefix).catch("DNA"),
  kind: z.enum(["percent", "amount"]),
  value: z.coerce.number().positive("Giá trị giảm phải lớn hơn 0").max(1e12),
  maxDiscount: z.coerce.number().min(0).max(1e12).catch(0),
  minOrder: z.coerce.number().min(0).max(1e12).catch(0),
  validDays: z.coerce.number().int().min(1, "Hạn dùng ít nhất 1 ngày").max(3650),
  perCustomer: z.coerce.number().int().min(1).max(100).catch(1),
  active: z.boolean().optional(),
  note: z.string().max(2000).catch(""),
}).refine((c) => c.kind !== "percent" || c.value <= 100, { message: "Phần trăm giảm tối đa 100%", path: ["value"] });

/** Cài đặt voucher (Pref "voucher"): mẫu tin gửi kèm. */
export type VoucherPref = { template: string };
export const VOUCHER_PREF_DEFAULT: VoucherPref = { template: DEFAULT_TEMPLATE };
