// Đối soát chuyển khoản + danh sách hoá đơn điện tử + vận đơn.
import { db } from "@/lib/db";
import { scoped } from "@/lib/sales/access";
import { salesPage } from "@/lib/sales/page";
import { ser } from "@/lib/sales/shared";
import { payPerm } from "@/lib/pay/access";
import { buyerOf } from "@/lib/einvoice/service";
import { PROVIDER_LABEL } from "@/lib/einvoice/providers";
import { einvoiceSettings } from "@/lib/einvoice/settings";
import { CARRIER_LABEL, type CarrierKey } from "@/lib/ship/types";
import { PaymentsClient } from "./PaymentsClient";

export const metadata = { title: "Đối soát chuyển khoản" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await salesPage();
  const perm = await payPerm(ctx);
  const wid = ctx.workspace.id;
  const orders = await db.order.findMany({ where: scoped(ctx.scope.where, {}), select: { id: true, number: true, customerName: true } });
  const om = new Map(orders.map((o) => [o.id, o]));
  const ids = orders.map((o) => o.id);
  const [invs, ships, einv] = await Promise.all([
    db.eInvoice.findMany({ where: { workspaceId: wid, orderId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.shipment.findMany({ where: { workspaceId: wid, orderId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 300 }),
    einvoiceSettings(wid),
  ]);
  const { tab } = await searchParams;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PaymentsClient
        initialTab={tab ?? (perm.reconcile ? "bank" : "invoices")}
        canReconcile={perm.reconcile}
        canInvoice={perm.einvoice}
        einvoiceProvider={einv.provider}
        invoices={ser(invs.map((i) => ({ id: i.id, orderId: i.orderId, order: om.get(i.orderId)!, provider: i.provider, providerLabel: PROVIDER_LABEL[i.provider as keyof typeof PROVIDER_LABEL] ?? i.provider, status: i.status, series: i.series, number: i.number, total: i.total, issuedAt: i.issuedAt, createdAt: i.createdAt, buyer: buyerOf(i) })))}
        shipments={ser(ships.map((s) => ({ id: s.id, orderId: s.orderId, order: om.get(s.orderId)!, carrier: CARRIER_LABEL[s.carrier as CarrierKey] ?? s.carrier, trackingCode: s.trackingCode, status: s.status, fee: s.fee, cod: s.cod, updatedAt: s.updatedAt })))}
      />
    </div>
  );
}
