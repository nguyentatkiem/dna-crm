import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { ser } from "@/lib/sales/shared";
import { ContractsClient } from "./ContractsClient";

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ open?: string; record?: string }> }) {
  const ctx = await salesPage();
  const sp = await searchParams;
  const [rows, orders] = await Promise.all([
    db.contract.findMany({ where: scoped(ctx.scope.where, {}), take: 1000 }),
    db.order.findMany({ where: scoped(ctx.scope.where, { status: { not: "cancelled" } }), orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, customerName: true, total: true, contactId: true, recordId: true } }),
  ]);
  const ids = [...new Set(rows.flatMap((c) => [c.contactId, c.recordId]).filter((x): x is string => !!x))];
  const recs = ids.length ? await db.record.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: ids } }, select: { id: true, title: true, objectKey: true } }) : [];
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <ContractsClient initial={ser(rows)} orders={orders} recs={recs} openId={sp.open ?? ""} dealLabel={ctx.dealLabel} canDelete={can(ctx.scope.role, "delete")} seeAll={ctx.scope.seeAll} me={ctx.user.name} />
    </div>
  );
}
