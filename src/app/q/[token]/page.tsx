import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify, userIdByName } from "@/lib/notify";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { PUBLIC_QUOTE_STATUSES, dmy, quoteExpired } from "@/lib/sales/shared";
import { quoteData } from "@/lib/print/doc";
import { PrintDoc, TEMPLATE_PRINT_CSS } from "@/lib/print/render";
import { templateFor } from "@/lib/print/server";
import { PrintButton } from "@/components/sales/PrintButton";
import { PRINT_CSS } from "@/components/sales/print";
import { PublicQuoteActions } from "./PublicQuoteActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Báo giá", robots: { index: false, follow: false } };

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await db.quote.findUnique({ where: { publicToken: token } });
  if (!q || !PUBLIC_QUOTE_STATUSES.includes(q.status)) notFound();
  const [ws, company, tpl] = await Promise.all([db.workspace.findUnique({ where: { id: q.workspaceId } }), getPref<Company>(q.workspaceId, "company", COMPANY_DEFAULT), templateFor(q.workspaceId, "quote")]);

  // Lần mở đầu tiên của khách: ghi viewedAt và báo người lập. Nhân viên trong workspace tự mở thì không tính.
  const s = await getSession();
  if (!q.viewedAt && s?.wid !== q.workspaceId) {
    const first = await db.quote.updateMany({ where: { id: q.id, viewedAt: null }, data: { viewedAt: new Date() } });
    if (first.count) await notify(q.workspaceId, { userId: await userIdByName(q.workspaceId, q.createdBy), kind: "quote", text: `${q.customerName} vừa mở báo giá ${q.number}`, href: `/w/quotes/${q.id}` });
  }

  const expired = q.status === "expired" || quoteExpired(q);
  const name = company.name || ws?.name || "";
  return (
    <main className="min-h-screen bg-bg px-3 py-6 sm:px-6 sm:py-10">
      <style>{PRINT_CSS + TEMPLATE_PRINT_CSS}</style>
      <div className="print-area mx-auto max-w-[860px] rounded-xl bg-surface p-5 shadow-card sm:p-10">
        {/* Mẫu in mặc định của báo giá; trang khách xem không có ô ký (khách bấm Chấp nhận bên dưới). */}
        <PrintDoc layout={tpl.layout} data={quoteData(q)} company={{ ...company, name }} hide={["signatures"]} />
      </div>
      <div className="no-print mx-auto mt-4 grid max-w-[860px] gap-3">
        {q.status === "accepted" ? (
          <p className="rounded-lg bg-success-soft px-4 py-3 text-[14.5px] text-success">
            {q.acceptedName || "Quý khách"} đã chấp nhận báo giá ngày {dmy(q.acceptedAt)}. {name} sẽ liên hệ để tiến hành. Cảm ơn quý khách!
          </p>
        ) : q.status === "rejected" ? (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-[14.5px] text-danger">Quý khách đã từ chối báo giá này. Nếu cần báo giá mới, vui lòng liên hệ {company.phone || name}.</p>
        ) : expired ? (
          <p className="rounded-lg bg-warning-soft px-4 py-3 text-[14.5px] text-warning">Báo giá đã hết hạn ngày {dmy(q.validUntil)}. Vui lòng liên hệ {company.phone || name} để nhận báo giá mới.</p>
        ) : (
          <PublicQuoteActions token={token} customerName={q.customerName} />
        )}
        <div className="flex justify-end">
          <PrintButton label="Tải PDF / In" />
        </div>
      </div>
    </main>
  );
}
