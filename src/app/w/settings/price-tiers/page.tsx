import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { loyaltyPref } from "@/lib/care/server";
import { ser } from "@/lib/sales/shared";
import { PriceTiersClient } from "./PriceTiersClient";

export const metadata = { title: "Bảng giá theo hạng" };

export default async function PriceTiersPage() {
  const { user, workspace } = await requireApp();
  const acc = await getAccess(user.id, workspace.id);
  const [rules, pref, products] = await Promise.all([
    db.priceRule.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } }),
    loyaltyPref(workspace.id),
    db.product.findMany({ where: { workspaceId: workspace.id, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, category: true, price: true } }),
  ]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Bảng giá theo hạng thành viên</h1>
      <p className="mt-1 max-w-[720px] text-ink-2">
        Giá riêng cho từng hạng (hạng lấy từ <Link href="/w/loyalty" className="underline">Tích điểm</Link>). Khi lập báo giá/đơn cho khách đã gắn hồ sơ, giá hạng được áp tự động cho dòng mới. Ưu tiên: sản phẩm (giá cố định → %) → nhóm (giá cố định → %) → mọi sản phẩm.
      </p>
      <PriceTiersClient initial={ser(rules)} tiers={pref.tiers} loyaltyOn={pref.enabled} products={products} canEdit={allow(acc, "price_rules_manage")} />
    </div>
  );
}
