// Nghiệp vụ hoá đơn điện tử: phát hành (demo) / chuẩn bị file (MISA, Viettel, VNPT), ghi số, huỷ.
import type { EInvoice, Order } from "@prisma/client";
import { db, parseJson } from "@/lib/db";
import { audit } from "@/lib/audit";
import { COMPANY_DEFAULT, getPref, type Company } from "@/lib/prefs";
import { parseLines } from "@/lib/sales/lines";
import { money } from "@/lib/sales/shared";
import { buildInvoiceDoc, BUYER_EMPTY, validTaxCode, type Buyer, type InvoiceDoc } from "./doc";
import { EINVOICE_PROVIDERS, PROVIDER_LABEL, isProviderKey } from "./providers";
import { einvoiceSettings } from "./settings";

type Actor = { id: string; name: string } | null;
export const ACTIVE = ["draft", "issued"];

export const docOf = (inv: Pick<EInvoice, "rawJson">) => parseJson<{ doc?: InvoiceDoc }>(inv.rawJson, {}).doc ?? null;
export const buyerOf = (inv: Pick<EInvoice, "buyerJson">) => ({ ...BUYER_EMPTY, ...parseJson<Partial<Buyer>>(inv.buyerJson, {}) });

async function nextInvoiceNumber(workspaceId: string, series: string) {
  const key = `HDDT-${series}`;
  const row = await db.counter.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, value: 1 }, update: { value: { increment: 1 } } });
  return String(row.value).padStart(7, "0");
}

export async function sellerOf(workspaceId: string) {
  const [c, ws] = await Promise.all([getPref<Company>(workspaceId, "company", COMPANY_DEFAULT), db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })]);
  return { name: c.name || ws?.name || "", taxCode: c.taxCode, address: c.address, phone: c.phone, email: c.email, bank: c.bank };
}

export function cleanBuyer(b: Partial<Buyer>): Buyer {
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  return { name: s(b.name, 200), company: s(b.company, 300), taxCode: s(b.taxCode, 20).replace(/\s/g, ""), address: s(b.address, 400), email: s(b.email, 200), phone: s(b.phone, 30) };
}

export async function issueInvoice(order: Order, buyerIn: Partial<Buyer>, actor: Actor): Promise<{ invoice: EInvoice } | { error: string; status?: number }> {
  if (order.status === "cancelled") return { error: "Đơn đã huỷ, không xuất hoá đơn", status: 409 };
  const buyer = cleanBuyer(buyerIn);
  if (!buyer.name && !buyer.company) return { error: "Cần tên người mua hoặc tên đơn vị" };
  if (!validTaxCode(buyer.taxCode)) return { error: "Mã số thuế người mua không hợp lệ (10 số, 10 số-3 số, hoặc 12 số)" };
  if (buyer.email && !/^\S+@\S+\.\S+$/.test(buyer.email)) return { error: "Email người mua không hợp lệ" };
  const lines = parseLines(order.itemsJson);
  if (!lines.length) return { error: "Đơn chưa có dòng hàng" };
  const active = await db.eInvoice.findFirst({ where: { workspaceId: order.workspaceId, orderId: order.id, status: { in: ACTIVE } } });
  if (active) return { error: active.status === "issued" ? `Đơn đã có hoá đơn ${active.series}-${active.number}. Huỷ hoá đơn cũ trước nếu cần xuất lại.` : "Đơn đang có hoá đơn nháp chờ phát hành", status: 409 };
  const s = await einvoiceSettings(order.workspaceId);
  const provider = EINVOICE_PROVIDERS[s.provider];
  const seller = await sellerOf(order.workspaceId);
  if (provider.mode !== "simulated" && !seller.taxCode) return { error: "Điền Mã số thuế doanh nghiệp ở Cài đặt → Thông tin doanh nghiệp trước khi xuất hoá đơn" };
  const doc = buildInvoiceDoc({ lines, discount: order.discount, orderNumber: order.number, seller, buyer, provider: s.provider, demo: provider.mode === "simulated", series: s.series, templateNo: s.templateNo, payMethod: s.payMethod });
  const inv = await db.eInvoice.create({ data: { workspaceId: order.workspaceId, orderId: order.id, provider: s.provider, status: "draft", series: s.series, buyerJson: JSON.stringify(buyer), total: doc.total, createdBy: actor?.name ?? "", rawJson: JSON.stringify({ doc }) } });
  try {
    const r = await provider.issue(doc, { nextNumber: () => nextInvoiceNumber(order.workspaceId, s.series) });
    const finalDoc = { ...doc, series: r.series, number: r.number, lookupCode: r.lookupCode };
    const updated = await db.eInvoice.update({
      where: { id: inv.id },
      data: { status: r.status, series: r.series, number: r.number, lookupCode: r.lookupCode, pdfUrl: r.pdfUrl || `/api/einvoice/${inv.id}/view`, issuedAt: r.status === "issued" ? new Date() : null, rawJson: JSON.stringify({ doc: finalDoc, note: r.note }) },
    });
    await audit({ workspaceId: order.workspaceId, user: actor }, "einvoice.issue", "order", order.id, `${r.status === "issued" ? "Xuất" : "Chuẩn bị"} hoá đơn ${PROVIDER_LABEL[s.provider]}${r.number ? ` ${r.series}-${r.number}` : ""} cho đơn ${order.number} (${money(doc.total)})`);
    return { invoice: updated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const failed = await db.eInvoice.update({ where: { id: inv.id }, data: { status: "failed", error: msg.slice(0, 500) } });
    return { invoice: failed };
  }
}

/** Ghi ký hiệu/số hoá đơn đã phát hành trên phần mềm nhà cung cấp (chế độ xuất file). */
export async function recordNumber(inv: EInvoice, input: { series: string; number: string; lookupCode?: string; issuedAt?: Date }, actor: Actor) {
  if (inv.provider === "demo") return { error: "Hoá đơn demo tự cấp số" };
  if (inv.status === "cancelled") return { error: "Hoá đơn đã huỷ" };
  const series = input.series.trim().toUpperCase().slice(0, 12);
  const number = input.number.replace(/\D/g, "").slice(0, 8);
  if (!series || !number) return { error: "Cần ký hiệu và số hoá đơn" };
  const doc = docOf(inv);
  const updated = await db.eInvoice.update({
    where: { id: inv.id },
    data: { status: "issued", series, number, lookupCode: (input.lookupCode ?? "").trim().slice(0, 60), issuedAt: input.issuedAt ?? new Date(), error: "", rawJson: JSON.stringify({ ...parseJson<object>(inv.rawJson, {}), doc: doc ? { ...doc, series, number, lookupCode: input.lookupCode ?? "", date: (input.issuedAt ?? new Date()).toISOString() } : undefined }) },
  });
  await audit({ workspaceId: inv.workspaceId, user: actor }, "einvoice.number", "order", inv.orderId, `Ghi số hoá đơn ${series}-${number} (${PROVIDER_LABEL[inv.provider as keyof typeof PROVIDER_LABEL] ?? inv.provider})`);
  return { invoice: updated };
}

export async function cancelInvoice(inv: EInvoice, reason: string, actor: Actor) {
  if (inv.status === "cancelled") return { error: "Hoá đơn đã huỷ" };
  const p = isProviderKey(inv.provider) ? EINVOICE_PROVIDERS[inv.provider] : EINVOICE_PROVIDERS.demo;
  const r = await p.cancel(inv);
  if (!r.ok) return { error: r.note };
  const updated = await db.eInvoice.update({ where: { id: inv.id }, data: { status: "cancelled", error: reason.slice(0, 300), rawJson: JSON.stringify({ ...parseJson<object>(inv.rawJson, {}), cancelNote: r.note, cancelReason: reason, cancelledAt: new Date().toISOString() }) } });
  await audit({ workspaceId: inv.workspaceId, user: actor }, "einvoice.cancel", "order", inv.orderId, `Huỷ hoá đơn ${inv.series}${inv.number ? `-${inv.number}` : " (nháp)"}${reason ? `: ${reason}` : ""}`);
  return { invoice: updated, note: r.note };
}

export { BUYER_EMPTY };
