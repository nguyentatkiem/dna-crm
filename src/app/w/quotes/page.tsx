import { db } from "@/lib/db";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { ser } from "@/lib/sales/shared";
import { QuotesList } from "./QuotesList";

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { scope } = await salesPage();
  const { status } = await searchParams;
  const rows = await db.quote.findMany({
    where: scoped(scope.where, {}),
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, number: true, customerName: true, customerPhone: true, title: true, status: true, total: true, validUntil: true, createdBy: true, createdAt: true, viewedAt: true, orderId: true },
  });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <QuotesList initial={ser(rows)} initialStatus={status ?? ""} seeAll={scope.perm.approve} canCreate={scope.perm.create} />
    </div>
  );
}
