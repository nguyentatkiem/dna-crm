// Nội dung một hoá đơn điện tử (thuần): dòng hàng, nhóm thuế suất, tổng, bằng chữ. Dùng cho bản xem, file xuất và kiểm thử.
import { dong, lineNet, type Line } from "@/lib/sales/lines";
import { amountInWordsVi } from "./words";

export type Buyer = { name: string; company: string; taxCode: string; address: string; email: string; phone: string };
export const BUYER_EMPTY: Buyer = { name: "", company: "", taxCode: "", address: "", email: "", phone: "" };
export type Seller = { name: string; taxCode: string; address: string; phone: string; email: string; bank: string };

export type InvoiceLine = { no: number; code: string; name: string; unit: string; qty: number; price: number; amount: number; vatPct: number; vat: number };
export type VatGroup = { vatPct: number; base: number; vat: number };
export type InvoiceDoc = {
  provider: string;
  demo: boolean;
  templateNo: string;
  series: string;
  number: string;
  lookupCode: string;
  date: string; // ISO
  orderNumber: string;
  payMethod: string;
  currency: "VND";
  seller: Seller;
  buyer: Buyer;
  lines: InvoiceLine[];
  discount: number;
  groups: VatGroup[];
  subtotal: number; // cộng tiền hàng sau chiết khấu, chưa thuế
  vatTotal: number;
  total: number;
  words: string;
};

/** Ký hiệu mặc định theo TT78: 1 (HĐ GTGT) + C (có mã) + 2 số năm + T + AA. */
export const defaultSeries = (d = new Date()) => `1C${String(d.getFullYear()).slice(-2)}TAA`;

/** Mã số thuế VN: 10 số, hoặc 10 số + "-" + 3 số (chi nhánh), hoặc 12 số (CCCD cá nhân). Rỗng = người mua không có MST. */
export const validTaxCode = (s: string) => !s || /^\d{10}(-\d{3})?$/.test(s) || /^\d{12}$/.test(s);

/** Dựng nội dung hoá đơn từ dòng hàng của đơn. Chiết khấu đơn trừ trước thuế, chia theo tỷ lệ như totals(). */
export function buildInvoiceDoc(input: { lines: Line[]; discount: number; orderNumber: string; seller: Seller; buyer: Buyer; provider: string; demo: boolean; series: string; templateNo?: string; number?: string; lookupCode?: string; date?: Date; payMethod?: string }): InvoiceDoc {
  const nets = input.lines.map(lineNet);
  const sub = nets.reduce((s, n) => s + n, 0);
  const discount = Math.min(Math.max(dong(input.discount), 0), sub);
  const lines: InvoiceLine[] = [];
  const groups = new Map<number, VatGroup>();
  let vatTotal = 0;
  input.lines.forEach((l, i) => {
    const share = sub ? (discount * nets[i]) / sub : 0;
    const vatPct = Number(l.vatPct) || 0;
    const vat = dong(((nets[i] - share) * vatPct) / 100);
    vatTotal += vat;
    lines.push({ no: i + 1, code: l.code, name: l.name, unit: l.unit, qty: Number(l.qty) || 0, price: Number(l.price) || 0, amount: nets[i], vatPct, vat });
    const g = groups.get(vatPct) ?? { vatPct, base: 0, vat: 0 };
    g.base += nets[i] - share;
    g.vat += vat;
    groups.set(vatPct, g);
  });
  const subtotal = sub - discount;
  const total = subtotal + vatTotal;
  return {
    provider: input.provider,
    demo: input.demo,
    templateNo: input.templateNo ?? "1",
    series: input.series,
    number: input.number ?? "",
    lookupCode: input.lookupCode ?? "",
    date: (input.date ?? new Date()).toISOString(),
    orderNumber: input.orderNumber,
    payMethod: input.payMethod ?? "TM/CK",
    currency: "VND",
    seller: input.seller,
    buyer: input.buyer,
    lines,
    discount,
    groups: [...groups.values()].map((g) => ({ ...g, base: dong(g.base) })).sort((a, b) => a.vatPct - b.vatPct),
    subtotal,
    vatTotal,
    total,
    words: amountInWordsVi(total),
  };
}
