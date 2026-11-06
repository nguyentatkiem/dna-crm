import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { ser } from "@/lib/sales/shared";
import { ProductsClient } from "./ProductsClient";

export default async function ProductsPage() {
  const { user, workspace } = await requireApp();
  const role = await getRole(user.id, workspace.id);
  const items = await db.product.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <ProductsClient initial={ser(items)} canEdit={can(role, "see_all")} canDelete={can(role, "delete")} />
    </div>
  );
}
