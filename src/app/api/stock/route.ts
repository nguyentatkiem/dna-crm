import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { firstError } from "@/lib/sales/schemas";
import { StockVoucherInput, isLow, stockValue } from "@/lib/stock/shared";
import { applyVoucher, stockPref } from "@/lib/stock/server";

/** Danh sách tồn kho: mọi sản phẩm (kèm cờ theo dõi), giá trị theo giá bán, cấu hình kho. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [rows, pref] = await Promise.all([
    db.product.findMany({ where: { workspaceId: wid }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, code: true, sku: true, name: true, unit: true, category: true, price: true, trackStock: true, stock: true, lowStock: true, active: true } }),
    stockPref(wid),
  ]);
  const items = rows.map((p) => ({ ...p, value: stockValue(p), low: isLow(p) }));
  return ok({ items, pref });
}

/** Phiếu nhập / xuất / kiểm kê nhiều dòng. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "stock_manage")) return fail("Bạn chưa có quyền “Nhập, xuất, kiểm kho”", 403);
  const p = StockVoucherInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const r = await applyVoucher(a.ctx.workspace.id, p.data, a.ctx.user);
  if ("error" in r) return fail(r.error, 409);
  return ok(r, 201);
}
