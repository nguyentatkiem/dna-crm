import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { allow } from "@/lib/permissions";
import { contactCard } from "@/lib/care/server";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { contractData } from "@/lib/print/doc";
import { PrintPage } from "@/lib/print/PrintPage";
import { printCompany, templateFor } from "@/lib/print/server";

/** In hợp đồng theo mẫu in; hợp đồng gắn đơn thì kèm bảng hàng của đơn. */
export default async function ContractPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const c = await db.contract.findFirst({ where: scoped(ctx.scope.where, { id }) });
  if (!c) notFound();
  const wid = ctx.workspace.id;
  const [order, contact] = await Promise.all([
    c.orderId ? db.order.findFirst({ where: { id: c.orderId, workspaceId: wid } }) : null,
    c.contactId ? db.record.findFirst({ where: { id: c.contactId, workspaceId: wid } }) : null,
  ]);
  const card = contact ? contactCard(ctx.config, contact) : null;
  const [company, tpl] = await Promise.all([printCompany(wid, ctx.config.businessName || ctx.workspace.name), templateFor(wid, "contract", (await searchParams).t)]);
  return <PrintPage docType="contract" back={{ href: `/w/contracts?open=${id}`, label: c.number }} data={contractData(c, order, card ?? undefined)} company={company} layout={tpl.layout} templates={tpl.templates} current={tpl.current} canEditTemplates={allow(ctx.scope.access, "print_templates_manage")} />;
}
