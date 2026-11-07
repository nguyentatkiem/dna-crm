import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { isLow, stockValue } from "@/lib/stock/shared";
import { stockPref } from "@/lib/stock/server";
import { StockClient } from "./StockClient";

export const metadata = { title: "Tồn kho" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ low?: string; product?: string }> }) {
  const { user, workspace } = await requireApp();
  const acc = await getAccess(user.id, workspace.id);
  const sp = await searchParams;
  const [rows, pref] = await Promise.all([
    db.product.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, code: true, sku: true, name: true, unit: true, category: true, price: true, trackStock: true, stock: true, lowStock: true, active: true } }),
    stockPref(workspace.id),
  ]);
  const items = rows.map((p) => ({ ...p, value: stockValue(p), low: isLow(p) }));
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <StockClient initial={items} pref={pref} canManage={allow(acc, "stock_manage")} canProducts={allow(acc, "product_manage")} canExport={allow(acc, "record_export") || allow(acc, "stock_manage")} initialView={sp.low ? "low" : "tracked"} openProduct={sp.product ?? null} />
    </div>
  );
}
