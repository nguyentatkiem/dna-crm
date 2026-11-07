import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { allow } from "@/lib/permissions";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { orderData } from "@/lib/print/doc";
import { PrintPage } from "@/lib/print/PrintPage";
import { printCompany, templateFor } from "@/lib/print/server";

/** In đơn hàng / phiếu giao hàng theo mẫu in (?t=id chọn mẫu). */
export default async function OrderPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const o = await db.order.findFirst({ where: scoped(ctx.scope.where, { id }) });
  if (!o) notFound();
  const [company, tpl] = await Promise.all([printCompany(ctx.workspace.id, ctx.config.businessName || ctx.workspace.name), templateFor(ctx.workspace.id, "order", (await searchParams).t)]);
  return <PrintPage docType="order" back={{ href: `/w/orders/${id}`, label: o.number }} data={orderData(o)} company={company} layout={tpl.layout} templates={tpl.templates} current={tpl.current} canEditTemplates={allow(ctx.scope.access, "print_templates_manage")} />;
}
