import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { ProductInput, firstError } from "@/lib/sales/schemas";
import { fold } from "@/lib/sales/shared";
import { recordMoves } from "@/lib/stock/server";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const q = fold(sp.get("q")?.trim() ?? "");
  const category = sp.get("category") ?? "";
  const active = sp.get("active");
  const rows = await db.product.findMany({
    where: { workspaceId: a.ctx.workspace.id, ...(category ? { category } : {}), ...(active === "1" ? { active: true } : active === "0" ? { active: false } : {}) },
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    take: 2000,
  });
  // Lọc không dấu ở đây vì SQLite không so khớp tiếng Việt không dấu.
  const items = q ? rows.filter((p) => fold(`${p.code} ${p.name} ${p.category}`).includes(q)) : rows;
  return ok({ items });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "product_manage")) return fail("Bạn chưa có quyền quản lý sản phẩm", 403);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = ProductInput.safeParse(body);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  let item = await db.product.create({ data: { ...d, trackStock: d.trackStock ?? false, unit: d.unit || "cái", active: d.active ?? true, workspaceId: a.ctx.workspace.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "product.create", "product", item.id, `Thêm sản phẩm “${item.name}”`);
  // Tồn đầu kỳ: ghi một phiếu kiểm kê để sổ kho có số dư ban đầu.
  const opening = Number(body.openingStock) || 0;
  if (item.trackStock && opening > 0 && opening < 1e9) {
    await recordMoves(item.workspaceId, [{ productId: item.id, qty: opening, kind: "adjust", note: "Tồn đầu kỳ", by: a.ctx.user.name }]);
    item = (await db.product.findUnique({ where: { id: item.id } })) ?? item;
  }
  return ok(item, 201);
}
