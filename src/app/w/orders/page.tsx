import { db } from "@/lib/db";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { ser } from "@/lib/sales/shared";
import { OrdersList } from "./OrdersList";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; debt?: string }> }) {
  const { scope } = await salesPage();
  const sp = await searchParams;
  const rows = await db.order.findMany({
    where: scoped(scope.where, {}),
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, number: true, customerName: true, customerPhone: true, status: true, total: true, paid: true, dueAt: true, createdBy: true, createdAt: true, quoteId: true },
  });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <OrdersList initial={ser(rows)} initialStatus={sp.status ?? ""} initialDebt={sp.debt === "open" || sp.debt === "overdue" ? sp.debt : ""} />
    </div>
  );
}
