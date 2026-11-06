import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { WarrantyClient } from "./WarrantyClient";

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { workspace } = await requireApp();
  const { id } = await searchParams;
  const products = await db.product.findMany({ where: { workspaceId: workspace.id, active: true }, select: { id: true, name: true, code: true, warrantyMonths: true }, orderBy: { name: "asc" }, take: 500 });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Bảo hành</h1>
      <p className="mt-1 text-ink-2">Phiếu bảo hành tự tạo khi đơn có sản phẩm bảo hành hoàn tất, hoặc nhập tay. Hệ thống nhắc trước 30 ngày khi sắp hết hạn.</p>
      <WarrantyClient products={products} lookupPath={`/bh/${workspace.formKey}`} focusId={id ?? ""} />
    </div>
  );
}
