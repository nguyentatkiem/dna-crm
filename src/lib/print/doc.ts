// Chuyển báo giá / đơn hàng / hợp đồng thành dữ liệu in chung. Thuần.
import { moneyWords, parseLines, totals as calcTotals } from "@/lib/sales/lines";
import { dmy, money } from "@/lib/sales/shared";
import type { PrintCompany, PrintData } from "./blocks";

type D = string | Date | null;
type QuoteLike = { number: string; title: string; customerName: string; customerPhone: string; customerEmail: string; createdAt: D; validUntil: D; itemsJson: string; subtotal: number; discount: number; vatTotal: number; total: number; note: string; terms: string; createdBy: string; orderId?: string | null };
type OrderLike = {
  id: string;
  number: string;
  customerName: string;
  customerPhone: string;
  createdAt: D;
  itemsJson: string;
  subtotal: number;
  discount: number;
  vatTotal: number;
  total: number;
  paid: number;
  note: string;
  createdBy: string;
  shipName?: string;
  shipPhone?: string;
  shipAddress?: string;
  shipWard?: string;
  shipDistrict?: string;
  shipProvince?: string;
};
type ContractLike = { number: string; title: string; customerName: string; value: number; signedAt: D; startAt: D; endAt: D; note: string; createdBy: string; createdAt: D; orderId?: string | null };

export function quoteData(q: QuoteLike): PrintData {
  return {
    docType: "quote",
    number: q.number,
    title: q.title,
    date: q.createdAt ?? new Date(),
    validUntil: q.validUntil,
    customer: { name: q.customerName, phone: q.customerPhone, email: q.customerEmail, address: "" },
    items: parseLines(q.itemsJson),
    totals: { subtotal: q.subtotal, discount: q.discount, vatTotal: q.vatTotal, total: q.total },
    note: q.note,
    terms: q.terms,
    createdBy: q.createdBy,
    orderId: q.orderId ?? null,
  };
}

export function orderData(o: OrderLike, terms = ""): PrintData {
  // Địa chỉ chi tiết có khi đã gồm phường/quận/tỉnh (đơn sàn): không lặp lại phần đã có.
  const base = (o.shipAddress ?? "").trim();
  const low = base.toLowerCase();
  const addr = [base, ...[o.shipWard, o.shipDistrict, o.shipProvince].filter((x): x is string => !!x && !low.includes(x.toLowerCase()))].filter(Boolean).join(", ");
  return {
    docType: "order",
    number: o.number,
    title: "",
    date: o.createdAt ?? new Date(),
    customer: { name: o.shipName || o.customerName, phone: o.shipPhone || o.customerPhone, email: "", address: addr },
    items: parseLines(o.itemsJson),
    totals: { subtotal: o.subtotal, discount: o.discount, vatTotal: o.vatTotal, total: o.total },
    paid: o.paid,
    note: o.note,
    terms,
    createdBy: o.createdBy,
    orderId: o.id,
  };
}

/** Hợp đồng gắn đơn thì in kèm bảng hàng của đơn. */
export function contractData(c: ContractLike, order?: (OrderLike & { customerPhone: string }) | null, customer?: { phone: string; email: string }): PrintData {
  const items = order ? parseLines(order.itemsJson) : [];
  return {
    docType: "contract",
    number: c.number,
    title: c.title,
    date: c.signedAt ?? c.createdAt ?? new Date(),
    customer: { name: c.customerName, phone: customer?.phone || order?.customerPhone || "", email: customer?.email ?? "", address: "" },
    items,
    totals: order ? { subtotal: order.subtotal, discount: order.discount, vatTotal: order.vatTotal, total: order.total } : { ...calcTotals([]), total: c.value },
    paid: order?.paid,
    note: c.note,
    terms: "",
    createdBy: c.createdBy,
    orderId: c.orderId ?? null,
    contract: { value: c.value, startAt: c.startAt, endAt: c.endAt, signedAt: c.signedAt },
  };
}

/** Biến dùng trong khối văn bản tự do, nhãn chữ ký... */
export function varsOf(d: PrintData, company: Pick<PrintCompany, "name">): Record<string, string> {
  const left = Math.max(0, Math.round(d.totals.total - (d.paid ?? 0)));
  return {
    ten_khach: d.customer.name,
    sdt_khach: d.customer.phone,
    email_khach: d.customer.email,
    dia_chi_khach: d.customer.address,
    so_chung_tu: d.number,
    ngay: dmy(d.date),
    tieu_de: d.title,
    tong_tien: money(d.totals.total),
    tong_tien_chu: moneyWords(d.totals.total),
    da_thu: money(d.paid ?? 0),
    con_no: money(left),
    hieu_luc: d.validUntil ? dmy(d.validUntil) : "không giới hạn",
    gia_tri_hd: money(d.contract?.value ?? d.totals.total),
    gia_tri_chu: moneyWords(d.contract?.value ?? d.totals.total),
    ngay_bat_dau: d.contract?.startAt ? dmy(d.contract.startAt) : "…",
    ngay_ket_thuc: d.contract?.endAt ? dmy(d.contract.endAt) : "…",
    ngay_ky: d.contract?.signedAt ? dmy(d.contract.signedAt) : "…",
    ten_cong_ty: company.name || "bên bán",
    nguoi_lap: d.createdBy,
  };
}
