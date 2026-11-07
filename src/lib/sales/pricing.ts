// Bảng giá theo hạng thành viên. Thuần: dùng chung trình soạn chứng từ (client) và API (server).
import { z } from "zod";
import { dong, type Line } from "./lines";

export type PriceRuleLite = { id: string; tier: string; productId: string; category: string; discountPct: number; price: number | null; active?: boolean };
export type PriceResult = { price: number; ruleId: string | null; label: string };

/** Độ ưu tiên: sản phẩm giá cố định > sản phẩm % > nhóm giá cố định > nhóm % > mọi sản phẩm (cố định > %) > không. */
function rank(r: PriceRuleLite, productId: string | undefined, category: string): number {
  const fixed = r.price !== null && r.price !== undefined && Number.isFinite(r.price);
  if (r.productId) return productId && r.productId === productId ? (fixed ? 1 : 2) : 0;
  if (r.category) return category && r.category === category ? (fixed ? 3 : 4) : 0;
  return fixed ? 5 : 6;
}

const pctText = (n: number) => `${Math.round(n * 100) / 100}`.replace(".", ",");

/**
 * Giá áp cho một sản phẩm theo hạng khách.
 * Không có hạng / không có quy tắc khớp → giá niêm yết, ruleId null.
 * Giá ra không bao giờ âm; quy tắc % kẹp trong [0, 100].
 */
export function priceFor({ basePrice, productId, category = "", tier, rules }: { basePrice: number; productId?: string; category?: string; tier: string | null | undefined; rules: PriceRuleLite[] }): PriceResult {
  const none = { price: dong(basePrice), ruleId: null, label: "" };
  if (!tier) return none;
  let best: PriceRuleLite | null = null;
  let bestRank = 99;
  for (const r of rules) {
    if (r.active === false || r.tier !== tier) continue;
    const k = rank(r, productId, category);
    if (k && k < bestRank) (best = r), (bestRank = k);
  }
  if (!best) return none;
  if (best.price !== null && best.price !== undefined && Number.isFinite(best.price)) {
    return { price: Math.max(0, dong(best.price)), ruleId: best.id, label: `Giá hạng ${tier}` };
  }
  const pct = Math.min(100, Math.max(0, Number(best.discountPct) || 0));
  if (!pct) return none;
  return { price: Math.max(0, dong(basePrice - (basePrice * pct) / 100)), ruleId: best.id, label: `Giá hạng ${tier} −${pctText(pct)}%` };
}

type Prod = { id: string; price: number; category: string };

/**
 * Máy chủ đóng dấu dòng hàng: ghi listPrice và priceRuleId đúng sự thật để client không giả nhãn
 * "giá hạng". Giá người dùng gõ tay vẫn giữ nguyên (như trước); chỉ dòng có giá == giá hạng mới mang ruleId.
 */
export function stampLines(lines: Line[], products: Prod[], tier: string | null | undefined, rules: PriceRuleLite[]): Line[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return lines.map((l) => {
    const { priceRuleId: _r, listPrice: _l, ...rest } = l;
    const p = l.productId ? byId.get(l.productId) : undefined;
    if (!p) return rest;
    const r = priceFor({ basePrice: p.price, productId: p.id, category: p.category, tier, rules });
    const out: Line = { ...rest, listPrice: dong(p.price) };
    if (r.ruleId && dong(l.price) === r.price) out.priceRuleId = r.ruleId;
    return out;
  });
}

export const PriceRuleInput = z
  .object({
    tier: z.string().trim().min(1, "Cần chọn hạng").max(60),
    productId: z.string().trim().max(60).catch(""),
    category: z.string().trim().max(80).catch(""),
    discountPct: z.coerce.number().min(0, "Chiết khấu từ 0 đến 100%").max(100, "Chiết khấu từ 0 đến 100%").catch(0),
    price: z
      .union([z.literal(""), z.null(), z.coerce.number().min(0).max(1e13)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    active: z.boolean().optional(),
  })
  .refine((r) => !(r.productId && r.category), { message: "Chọn sản phẩm hoặc nhóm, không chọn cả hai" })
  .refine((r) => r.price !== null || r.discountPct > 0, { message: "Cần nhập % chiết khấu hoặc giá cố định" });

/** Mô tả ngắn một quy tắc cho bảng xem trước. */
export function ruleText(r: Pick<PriceRuleLite, "discountPct" | "price">) {
  return r.price !== null && r.price !== undefined ? `Giá cố định ${Math.round(r.price).toLocaleString("vi-VN")} ₫` : `Giảm ${pctText(r.discountPct)}%`;
}
