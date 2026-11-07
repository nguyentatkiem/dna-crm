import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { allow } from "@/lib/permissions";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { quoteData } from "@/lib/print/doc";
import { PrintPage } from "@/lib/print/PrintPage";
import { printCompany, templateFor } from "@/lib/print/server";

export default async function QuotePrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const q = await db.quote.findFirst({ where: scoped(ctx.scope.where, { id }) });
  if (!q) notFound();
  const [company, tpl] = await Promise.all([printCompany(ctx.workspace.id, ctx.config.businessName || ctx.workspace.name), templateFor(ctx.workspace.id, "quote", (await searchParams).t)]);
  return <PrintPage docType="quote" back={{ href: `/w/quotes/${id}`, label: q.number }} data={quoteData(q)} company={company} layout={tpl.layout} templates={tpl.templates} current={tpl.current} canEditTemplates={allow(ctx.scope.access, "print_templates_manage")} />;
}
