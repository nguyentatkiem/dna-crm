import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canEditDoc, scoped } from "@/lib/sales/access";
import { parseLines } from "@/lib/sales/lines";
import { activeProducts, salesPage } from "@/lib/sales/page";
import { originOf } from "@/lib/sales/service";
import { ser, ymd } from "@/lib/sales/shared";
import { DocEditor } from "@/components/sales/DocEditor";
import { QuoteDetail } from "./QuoteDetail";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const { edit } = await searchParams;
  const q = await db.quote.findFirst({ where: scoped(ctx.scope.where, { id }) });
  if (!q) notFound();
  const mine = canEditDoc(ctx, ctx.scope.perm.editOthers, q);
  const editable = mine && q.status !== "accepted" && !q.orderId;
  const ids = [q.recordId, q.contactId].filter((x): x is string => !!x);
  const recs = ids.length ? await db.record.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: ids } }, select: { id: true, title: true, objectKey: true } }) : [];
  const deal = recs.find((r) => r.id === q.recordId) ?? null;
  const contact = recs.find((r) => r.id === q.contactId) ?? null;
  const items = parseLines(q.itemsJson);

  if (edit && editable) {
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <Link href={`/w/quotes/${id}`} className="text-[13px] text-ink-2 hover:underline">
          ← {q.number}
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold">Sửa báo giá {q.number}</h1>
        {!ctx.scope.perm.approve && q.status !== "draft" && <p className="mt-1 text-[13.5px] text-warning">Sửa báo giá đã duyệt/đã gửi sẽ đưa về nháp và cần duyệt lại.</p>}
        <DocEditor
          kind="quote"
          id={id}
          products={await activeProducts(ctx.workspace.id)}
          seeAll={ctx.scope.perm.approve}
          dealLabel={ctx.dealLabel}
          backHref={`/w/quotes/${id}`}
          initial={{
            contactId: q.contactId,
            contactTitle: contact?.title ?? "",
            recordId: q.recordId,
            recordTitle: deal?.title ?? "",
            customerName: q.customerName,
            customerPhone: q.customerPhone,
            customerEmail: q.customerEmail,
            title: q.title,
            items,
            discount: q.discount,
            validUntil: ymd(q.validUntil),
            dueAt: "",
            note: q.note,
            terms: q.terms,
          }}
        />
      </div>
    );
  }

  const order = q.orderId ? await db.order.findFirst({ where: { id: q.orderId, workspaceId: ctx.workspace.id }, select: { id: true, number: true } }) : null;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/quotes" className="text-[13px] text-ink-2 hover:underline">
        ← Báo giá
      </Link>
      <QuoteDetail
        q={ser(q)}
        items={items}
        deal={deal}
        contact={contact}
        order={order}
        link={`${originOf(await headers())}/q/${q.publicToken}`}
        perm={{ seeAll: ctx.scope.perm.approve, mine, editable, canDelete: ctx.scope.perm.del }}
        dealLabel={ctx.dealLabel}
      />
    </div>
  );
}
