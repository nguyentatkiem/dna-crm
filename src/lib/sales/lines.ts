// Tính tiền dòng hàng cho báo giá và đơn hàng. Thuần, dùng được cả client lẫn server.
import { z } from "zod";

export type Line = {
  productId?: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  discountPct: number;
  vatPct: number;
  /** Giá niêm yết của sản phẩm lúc lập chứng từ (máy chủ ghi). */
  listPrice?: number;
  /** Quy tắc giá theo hạng đã áp (máy chủ xác nhận; rỗng = giá niêm yết hoặc giá gõ tay). */
  priceRuleId?: string;
};
export type Totals = { subtotal: number; vatTotal: number; discount: number; total: number };

const pct = z.coerce.number().min(0).max(100).catch(0);

export const LineSchema = z.object({
  productId: z.string().max(60).optional().nullable().transform((v) => v || undefined),
  code: z.string().max(60).catch(""),
  name: z.string().trim().min(1, "Dòng hàng cần có tên").max(300),
  unit: z.string().max(40).catch(""),
  qty: z.coerce.number().min(0).max(1e9),
  price: z.coerce.number().min(0).max(1e13),
  discountPct: pct,
  vatPct: pct,
  listPrice: z.coerce.number().min(0).max(1e13).optional().catch(undefined),
  priceRuleId: z.string().max(60).optional().nullable().catch(undefined).transform((v) => v || undefined),
});
export const LinesSchema = z.array(LineSchema).max(200);

/** Làm tròn về đồng (VND không có xu). */
export const dong = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

/** Thành tiền một dòng sau chiết khấu dòng, chưa VAT. */
export function lineNet(l: Pick<Line, "qty" | "price" | "discountPct">) {
  const gross = dong((Number(l.qty) || 0) * (Number(l.price) || 0));
  return gross - dong((gross * (Number(l.discountPct) || 0)) / 100);
}

/**
 * Tổng chứng từ.
 * - subtotal: tổng thành tiền các dòng sau chiết khấu dòng, chưa VAT.
 * - discount: chiết khấu cả đơn (tiền), kẹp trong [0, subtotal].
 * - Chiết khấu đơn trừ TRƯỚC thuế, chia cho các dòng theo tỷ lệ thành tiền,
 *   nên VAT mỗi dòng tính trên phần đã giảm (dòng có thuế suất khác nhau vẫn đúng).
 * - VAT làm tròn từng dòng rồi cộng lại, như cách ghi trên hoá đơn.
 * - total = subtotal - discount + vatTotal.
 */
export function totals(lines: Line[], orderDiscount = 0): Totals {
  const nets = lines.map(lineNet);
  const subtotal = nets.reduce((s, n) => s + n, 0);
  const discount = Math.min(Math.max(dong(orderDiscount), 0), subtotal);
  let vatTotal = 0;
  lines.forEach((l, i) => {
    const share = subtotal ? (discount * nets[i]) / subtotal : 0;
    vatTotal += dong(((nets[i] - share) * (Number(l.vatPct) || 0)) / 100);
  });
  return { subtotal, vatTotal, discount, total: subtotal - discount + vatTotal };
}

/** Đọc itemsJson an toàn (dữ liệu cũ hỏng thì bỏ dòng hỏng). */
export function parseLines(json: string | null | undefined): Line[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = LineSchema.safeParse(r);
    return p.success ? [p.data as Line] : [];
  });
}

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function block(n: number, full: boolean) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10;
  const out: string[] = [];
  if (full || h) out.push(DIGITS[h], "trăm");
  if (t === 0 && u && (full || h)) out.push("lẻ");
  if (t === 1) out.push("mười");
  else if (t > 1) out.push(DIGITS[t], "mươi");
  if (u === 1 && t > 1) out.push("mốt");
  else if (u === 5 && t > 0) out.push("lăm");
  else if (u === 4 && t > 1) out.push("tư");
  else if (u) out.push(DIGITS[u]);
  return out.join(" ");
}

/** Đọc số tiền bằng chữ: 1250000 → "Một triệu hai trăm năm mươi nghìn đồng". */
export function moneyWords(n: number) {
  let v = Math.abs(dong(n));
  if (!v) return "Không đồng";
  const units = ["", "nghìn", "triệu", "tỷ"];
  const parts: string[] = [];
  let i = 0;
  const groups: number[] = [];
  while (v > 0) {
    groups.push(v % 1000);
    v = Math.floor(v / 1000);
  }
  for (i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    const unit = units[i % 3 === 0 && i > 0 ? 3 : i % 3] + (i >= 6 && i % 3 !== 0 ? " tỷ" : "");
    parts.push([block(g, i < groups.length - 1), unit].filter(Boolean).join(" "));
  }
  const s = parts.join(" ").replace(/\s+/g, " ").trim() + " đồng";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
