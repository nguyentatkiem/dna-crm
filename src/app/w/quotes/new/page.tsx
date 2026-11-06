import { redirect } from "next/navigation";
import Link from "next/link";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { activeProducts, draftFromRecord, salesPage } from "@/lib/sales/page";
import { ymd } from "@/lib/sales/shared";
import { DocEditor } from "@/components/sales/DocEditor";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const ctx = await salesPage();
  if (!ctx.scope.perm.create) redirect("/w/quotes");
  const { record } = await searchParams;
  const [company, products, who] = await Promise.all([getPref<Company>(ctx.workspace.id, "company", COMPANY_DEFAULT), activeProducts(ctx.workspace.id), draftFromRecord(ctx, record)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/quotes" className="text-[13px] text-ink-2 hover:underline">
        ← Báo giá
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Báo giá mới</h1>
      <DocEditor
        kind="quote"
        products={products}
        seeAll={ctx.scope.perm.approve}
        dealLabel={ctx.dealLabel}
        backHref="/w/quotes"
        initial={{ ...who, title: "", items: [], discount: 0, validUntil: ymd(new Date(Date.now() + 15 * 864e5)), dueAt: "", note: "", terms: company.quoteTerms }}
      />
    </div>
  );
}
