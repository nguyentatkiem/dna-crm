import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { parseLayout, sampleData, type DocType, type PrintData } from "@/lib/print/blocks";
import { contractData, orderData, quoteData } from "@/lib/print/doc";
import { printCompany } from "@/lib/print/server";
import { TemplatesClient, type Tpl } from "./TemplatesClient";

export const metadata = { title: "Mẫu in" };

/** Chứng từ thật gần nhất của từng loại để xem trước (không có thì dùng dữ liệu mẫu). */
async function samples(wid: string, terms: string): Promise<Record<DocType, PrintData | null>> {
  const [q, o, c] = await Promise.all([
    db.quote.findFirst({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" } }),
    db.order.findFirst({ where: { workspaceId: wid, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" } }),
    db.contract.findFirst({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" } }),
  ]);
  const co = c?.orderId ? await db.order.findFirst({ where: { id: c.orderId, workspaceId: wid } }) : null;
  const ser = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as T;
  return { quote: q ? ser(quoteData(q)) : null, order: o ? ser(orderData(o, terms)) : null, contract: c ? ser(contractData(c, co)) : null };
}

export default async function PrintTemplatesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const canEdit = allow(await getAccess(user.id, workspace.id), "print_templates_manage");
  const company = await printCompany(workspace.id, config.businessName || workspace.name);
  const rows = await db.printTemplate.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  const tpls: Tpl[] = rows.map((r) => ({ id: r.id, name: r.name, docType: r.docType as DocType, isDefault: r.isDefault, layout: parseLayout(r.layoutJson, r.docType as DocType) }));
  const real = await samples(workspace.id, "");
  const fake = { quote: sampleData("quote"), order: sampleData("order"), contract: sampleData("contract") };
  const t = (await searchParams).type;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="no-print text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 className="no-print mt-1 text-[26px] font-semibold">Mẫu in chứng từ</h1>
      <p className="no-print mt-1 max-w-[760px] text-ink-2">Kéo thả các khối để sắp xếp báo giá, đơn hàng, hợp đồng. Mẫu đặt “mặc định” được dùng khi bấm In; trên trang in vẫn chọn được mẫu khác.</p>
      <TemplatesClient initial={tpls} company={company} real={real} fake={fake} canEdit={canEdit} initialType={t === "order" || t === "contract" ? t : "quote"} />
    </div>
  );
}
