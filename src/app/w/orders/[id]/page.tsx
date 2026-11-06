import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { scoped } from "@/lib/sales/access";
import { parseLines } from "@/lib/sales/lines";
import { activeProducts, salesPage } from "@/lib/sales/page";
import { ser, ymd } from "@/lib/sales/shared";
import { DocEditor } from "@/components/sales/DocEditor";
import { valueText } from "@/lib/voucher/shared";
import { OrderDetail } from "./OrderDetail";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const ctx = await salesPage();
  const { id } = await params;
  const { edit } = await searchParams;
  const o = await db.order.findFirst({ where: scoped(ctx.scope.where, { id }), include: { payments: { orderBy: { paidAt: "desc" } } } });
  if (!o) notFound();
  const ids = [o.recordId, o.contactId].filter((x): x is string => !!x);
  const recs = ids.length ? await db.record.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: ids } }, select: { id: true, title: true, objectKey: true } }) : [];
  const deal = recs.find((r) => r.id === o.recordId) ?? null;
  const contact = recs.find((r) => r.id === o.contactId) ?? null;
  const items = parseLines(o.itemsJson);
  // Mã giảm giá đang gắn với chính đơn này (đơn huỷ/xoá thì mã đã được hoàn, không còn gắn).
  const vRow = o.voucherCode ? await db.voucher.findUnique({ where: { workspaceId_code: { workspaceId: ctx.workspace.id, code: o.voucherCode } }, include: { campaign: true } }) : null;
  const v = vRow && vRow.usedOrderId === o.id ? vRow : null;

  if (edit && o.status === "new") {
    // Chiết khấu tay = tổng chiết khấu − phần voucher (voucher hiện riêng ở ô "Mã giảm giá").
    return (
      <div className="canvas px-4 pb-16 pt-6 sm:px-8">
        <Link href={`/w/orders/${id}`} className="text-[13px] text-ink-2 hover:underline">
          ← {o.number}
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold">Sửa đơn {o.number}</h1>
        <DocEditor
          kind="order"
          id={id}
          products={await activeProducts(ctx.workspace.id)}
          seeAll={ctx.scope.seeAll}
          dealLabel={ctx.dealLabel}
          backHref={`/w/orders/${id}`}
          initial={{ contactId: o.contactId, contactTitle: contact?.title ?? "", recordId: o.recordId, recordTitle: deal?.title ?? "", customerName: o.customerName, customerPhone: o.customerPhone, customerEmail: "", title: "", items, discount: Math.max(0, o.discount - (v?.discount ?? 0)), voucherCode: o.voucherCode, voucherDiscount: v?.discount ?? 0, voucherLabel: v ? valueText(v.campaign) : "", validUntil: "", dueAt: ymd(o.dueAt), note: o.note, terms: "" }}
        />
      </div>
    );
  }

  const quote = o.quoteId ? await db.quote.findFirst({ where: { id: o.quoteId, workspaceId: ctx.workspace.id }, select: { id: true, number: true } }) : null;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/orders" className="text-[13px] text-ink-2 hover:underline">
        ← Đơn hàng
      </Link>
      <OrderDetail voucher={v ? { discount: v.discount } : null} initial={ser(o)} items={items} deal={deal} contact={contact} quote={quote} dealLabel={ctx.dealLabel} perm={{ seeAll: ctx.scope.seeAll, canDelete: can(ctx.scope.role, "delete") }} />
    </div>
  );
}
