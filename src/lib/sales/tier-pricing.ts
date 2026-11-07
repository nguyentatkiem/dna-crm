// Giá theo hạng phía server: hạng của khách (theo điểm đã tích), quy tắc giá, đóng dấu dòng hàng.
import { db } from "@/lib/db";
import { loyaltyOf } from "@/lib/care/server";
import { tierFor, type Tier } from "@/lib/care/shared";
import type { Line } from "./lines";
import { stampLines, type PriceRuleLite } from "./pricing";

/** Hạng hiện tại của khách; tắt tích điểm hoặc không có khách → null. Khách chưa có điểm = hạng thấp nhất. */
export async function tierOfContact(workspaceId: string, contactId: string | null | undefined): Promise<(Tier & { earned: number }) | null> {
  if (!contactId) return null;
  const { pref, map } = await loyaltyOf(workspaceId, [contactId]);
  if (!pref.enabled || !pref.tiers?.length) return null;
  const s = map.get(contactId);
  const earned = s?.earned ?? 0;
  return { ...(s?.tier ?? tierFor(0, pref.tiers)), earned };
}

export async function rulesForTier(workspaceId: string, tier: string | null | undefined): Promise<PriceRuleLite[]> {
  if (!tier) return [];
  const rows = await db.priceRule.findMany({ where: { workspaceId, tier, active: true }, select: { id: true, tier: true, productId: true, category: true, discountPct: true, price: true, active: true } });
  return rows;
}

/** Ghi listPrice + priceRuleId đúng thực tế cho các dòng (không đổi giá người dùng nhập). */
export async function stampDocLines(workspaceId: string, contactId: string | null | undefined, lines: Line[]): Promise<Line[]> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  if (!ids.length) return lines.map(({ priceRuleId: _r, listPrice: _l, ...rest }) => rest);
  const [products, tier] = await Promise.all([db.product.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, price: true, category: true } }), tierOfContact(workspaceId, contactId)]);
  const rules = await rulesForTier(workspaceId, tier?.name);
  return stampLines(lines, products, tier?.name, rules);
}
