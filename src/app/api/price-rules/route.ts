import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { loyaltyPref } from "@/lib/care/server";
import { PriceRuleInput, ruleText } from "@/lib/sales/pricing";
import { firstError } from "@/lib/sales/schemas";

/** Bảng giá theo hạng: quy tắc + hạng (từ cấu hình tích điểm) + sản phẩm để chọn. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [rules, pref, products] = await Promise.all([
    db.priceRule.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } }),
    loyaltyPref(wid),
    db.product.findMany({ where: { workspaceId: wid, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, category: true, price: true } }),
  ]);
  return ok({ rules, tiers: pref.tiers, enabled: pref.enabled, products });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!allow(await getAccess(a.ctx.user.id, wid), "price_rules_manage")) return fail("Bạn chưa có quyền “Bảng giá theo hạng”", 403);
  const p = PriceRuleInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  if (d.productId && !(await db.product.findFirst({ where: { id: d.productId, workspaceId: wid }, select: { id: true } }))) return fail("Không tìm thấy sản phẩm", 404);
  const rule = await db.priceRule.create({ data: { workspaceId: wid, tier: d.tier, productId: d.productId, category: d.category, discountPct: d.discountPct, price: d.price, active: d.active ?? true } });
  await audit({ workspaceId: wid, user: a.ctx.user }, "price_rule.create", "price_rule", rule.id, `Thêm giá hạng ${rule.tier}: ${ruleText(rule)}`);
  return ok(rule, 201);
}
