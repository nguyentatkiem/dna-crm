import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { scoped } from "@/lib/sales/access";
import { parseLines } from "@/lib/sales/lines";
import { salesPage } from "@/lib/sales/page";
import { QuoteSheet } from "@/components/sales/QuoteSheet";
import { PrintButton } from "@/components/sales/PrintButton";
import { PRINT_CSS } from "@/components/sales/print";

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const q = await db.quote.findFirst({ where: scoped(ctx.scope.where, { id }) });
  if (!q) notFound();
  const company = await getPref<Company>(ctx.workspace.id, "company", COMPANY_DEFAULT);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <Link href={`/w/quotes/${id}`} className="text-[13px] text-ink-2 hover:underline">
          ← {q.number}
        </Link>
        <PrintButton />
      </div>
      <div className="print-area mx-auto max-w-[210mm] rounded-lg border border-line-soft bg-surface p-5 sm:p-10">
        <QuoteSheet q={q} items={parseLines(q.itemsJson)} company={{ ...company, name: company.name || ctx.config.businessName || ctx.workspace.name }} print />
      </div>
    </div>
  );
}
