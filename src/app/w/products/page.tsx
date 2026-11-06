import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { ser } from "@/lib/sales/shared";
import { ProductsClient } from "./ProductsClient";

export default async function ProductsPage() {
  const { user, workspace } = await requireApp();
  const acc = await getAccess(user.id, workspace.id);
  const items = await db.product.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <ProductsClient initial={ser(items)} canEdit={allow(acc, "product_manage")} canDelete={allow(acc, "product_manage")} />
    </div>
  );
}
