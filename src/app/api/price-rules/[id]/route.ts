import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { PriceRuleInput, ruleText } from "@/lib/sales/pricing";
import { firstError } from "@/lib/sales/schemas";

type Ctx = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const wid = a.ctx.workspace.id;
  if (!allow(await getAccess(a.ctx.user.id, wid), "price_rules_manage")) return { error: fail("Bạn chưa có quyền “Bảng giá theo hạng”", 403) } as const;
  const before = await db.priceRule.findFirst({ where: { id, workspaceId: wid } });
  if (!before) return { error: fail("Không tìm thấy quy tắc giá", 404) } as const;
  return { a, before } as const;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Bật/tắt nhanh: { active }.
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    return ok(await db.priceRule.update({ where: { id: g.before.id }, data: { active: body.active } }));
  }
  const p = PriceRuleInput.safeParse({ ...g.before, ...body });
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const rule = await db.priceRule.update({ where: { id: g.before.id }, data: { tier: d.tier, productId: d.productId, category: d.category, discountPct: d.discountPct, price: d.price, active: d.active ?? g.before.active } });
  await audit({ workspaceId: g.a.ctx.workspace.id, user: g.a.ctx.user }, "price_rule.update", "price_rule", rule.id, `Sửa giá hạng ${rule.tier}: ${ruleText(rule)}`);
  return ok(rule);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  await db.priceRule.delete({ where: { id: g.before.id } });
  await audit({ workspaceId: g.a.ctx.workspace.id, user: g.a.ctx.user }, "price_rule.delete", "price_rule", g.before.id, `Xoá giá hạng ${g.before.tier}: ${ruleText(g.before)}`, { before: g.before });
  return ok({ deleted: true });
}
