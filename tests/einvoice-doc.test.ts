import { describe, expect, it } from "vitest";
import { buildInvoiceDoc, defaultSeries, validTaxCode } from "@/lib/einvoice/doc";
import { invoiceHtml } from "@/lib/einvoice/html";
import { importSheet } from "@/lib/einvoice/providers";
import { totals, type Line } from "@/lib/sales/lines";

const lines: Line[] = [
  { code: "A", name: "Serum", unit: "chai", qty: 2, price: 300000, discountPct: 10, vatPct: 10 },
  { code: "B", name: "Tư vấn", unit: "buổi", qty: 1, price: 500000, discountPct: 0, vatPct: 8 },
  { code: "C", name: "Sách", unit: "cuốn", qty: 3, price: 100000, discountPct: 0, vatPct: 0 },
];
const seller = { name: "Công ty A", taxCode: "0312345678", address: "1 Lê Lợi", phone: "", email: "", bank: "" };
const buyer = { name: "Nguyễn B", company: "Công ty B", taxCode: "0109876543", address: "HN", email: "b@x.vn", phone: "" };

describe("buildInvoiceDoc", () => {
  const d = buildInvoiceDoc({ lines, discount: 100000, orderNumber: "DH-2026-0001", seller, buyer, provider: "demo", demo: true, series: "1C26TAA" });
  it("tổng khớp totals() của đơn", () => {
    const t = totals(lines, 100000);
    expect(d.total).toBe(t.total);
    expect(d.vatTotal).toBe(t.vatTotal);
    expect(d.subtotal).toBe(t.subtotal - t.discount);
  });
  it("nhóm thuế suất cộng đúng", () => {
    expect(d.groups.map((g) => g.vatPct)).toEqual([0, 8, 10]);
    expect(d.groups.reduce((s, g) => s + g.vat, 0)).toBe(d.vatTotal);
    expect(d.words.endsWith("đồng")).toBe(true);
  });
  it("HTML có trường bắt buộc và dấu demo", () => {
    const h = invoiceHtml({ ...d, number: "0000001" });
    for (const s of ["Ký hiệu", "1C26TAA", "0000001", "Mã số thuế", "0312345678", "0109876543", "bằng chữ", "KHÔNG CÓ GIÁ TRỊ PHÁP LÝ"]) expect(h).toContain(s);
    expect(invoiceHtml({ ...d, name: "<x>" } as never)).not.toContain("<x>");
  });
  it("bảng kê nhập: mỗi dòng hàng một dòng", () => {
    const s = importSheet([d], "MISA");
    expect(s.rows.length).toBe(3);
    expect(s.rows[0][20]).toBe(d.total);
  });
});

it("MST và ký hiệu", () => {
  expect(validTaxCode("")).toBe(true);
  expect(validTaxCode("0312345678")).toBe(true);
  expect(validTaxCode("0312345678-001")).toBe(true);
  expect(validTaxCode("031234567")).toBe(false);
  expect(defaultSeries(new Date("2026-05-01"))).toBe("1C26TAA");
});
