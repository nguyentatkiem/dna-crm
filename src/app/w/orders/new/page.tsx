import Link from "next/link";
import { activeProducts, draftFromRecord, salesPage } from "@/lib/sales/page";
import { DocEditor } from "@/components/sales/DocEditor";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const ctx = await salesPage();
  const { record } = await searchParams;
  const [products, who] = await Promise.all([activeProducts(ctx.workspace.id), draftFromRecord(ctx, record)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/orders" className="text-[13px] text-ink-2 hover:underline">
        ← Đơn hàng
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Đơn hàng mới</h1>
      <p className="mt-1 text-[13.5px] text-ink-2">Có báo giá rồi? Mở báo giá và bấm “Tạo đơn hàng” để không phải nhập lại.</p>
      <DocEditor kind="order" products={products} seeAll={ctx.scope.seeAll} dealLabel={ctx.dealLabel} backHref="/w/orders" initial={{ ...who, title: "", items: [], discount: 0, validUntil: "", dueAt: "", note: "", terms: "" }} />
    </div>
  );
}
