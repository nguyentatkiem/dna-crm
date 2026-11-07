// Nhà cung cấp hoá đơn điện tử. "demo" mô phỏng hoàn toàn (không gửi cơ quan thuế).
// MISA meInvoice / Viettel S-Invoice / VNPT Invoice: CHẾ ĐỘ XUẤT FILE ĐỂ NHẬP — CRM không gọi API của nhà cung cấp,
// mà tạo file Excel bảng kê (cột phổ biến) để kế toán nhập vào phần mềm, rồi ghi lại ký hiệu/số hoá đơn đã phát hành.
import { randomBytes } from "node:crypto";
import { buildXlsx, XLSX_MIME, type SheetSpec } from "@/lib/xlsx";
import type { InvoiceDoc } from "./doc";

export type EInvoiceProviderKey = "demo" | "misa" | "viettel" | "vnpt";
export type IssueResult = { status: "issued" | "draft"; series: string; number: string; lookupCode: string; pdfUrl?: string; note: string };

/** HỢP ĐỒNG adapter: mọi nhà cung cấp đều theo giao diện này để sau thêm API thật không phải sửa giao diện. */
export interface EInvoiceProvider {
  key: EInvoiceProviderKey;
  label: string;
  mode: "simulated" | "export" | "api";
  /** Phát hành (demo) hoặc chuẩn bị file (export). `nextNumber` cấp số tuần tự cho demo. */
  issue(doc: InvoiceDoc, ctx: { nextNumber: () => Promise<string> }): Promise<IssueResult>;
  cancel(inv: { series: string; number: string }): Promise<{ ok: boolean; note: string }>;
  status(inv: { status: string }): Promise<{ status: string }>;
  /** File xuất để nhập vào phần mềm của nhà cung cấp (chỉ mode export). */
  exportFile?(docs: InvoiceDoc[]): Promise<{ name: string; mime: string; data: Buffer }>;
}

const lookup = () => randomBytes(6).toString("hex").toUpperCase();

const demo: EInvoiceProvider = {
  key: "demo",
  label: "Demo (mô phỏng, không có giá trị pháp lý)",
  mode: "simulated",
  async issue(doc, ctx) {
    const number = await ctx.nextNumber();
    return { status: "issued", series: doc.series, number, lookupCode: lookup(), note: "Hoá đơn mô phỏng – không gửi cơ quan thuế" };
  },
  async cancel() {
    return { ok: true, note: "Đã huỷ hoá đơn mô phỏng" };
  },
  async status(inv) {
    return { status: inv.status };
  },
};

/** Bảng kê nhập hoá đơn: mỗi dòng hàng một dòng, thông tin người mua lặp lại (định dạng chung, cần đối chiếu mẫu nhập của nhà cung cấp). */
export function importSheet(docs: InvoiceDoc[], providerLabel: string): SheetSpec {
  return {
    name: `Nhap ${providerLabel}`.slice(0, 31),
    columns: [
      { header: "Số đơn (khoá ghép)", kind: "text" },
      { header: "Ngày hoá đơn", kind: "date" },
      { header: "Mẫu số", kind: "text" },
      { header: "Ký hiệu", kind: "text" },
      { header: "Tên người mua", kind: "text" },
      { header: "Tên đơn vị", kind: "text" },
      { header: "Mã số thuế người mua", kind: "phone" },
      { header: "Địa chỉ", kind: "text" },
      { header: "Email nhận hoá đơn", kind: "text" },
      { header: "Hình thức thanh toán", kind: "text" },
      { header: "STT", kind: "number" },
      { header: "Mã hàng", kind: "text" },
      { header: "Tên hàng hoá, dịch vụ", kind: "text" },
      { header: "Đơn vị tính", kind: "text" },
      { header: "Số lượng", kind: "number" },
      { header: "Đơn giá", kind: "money" },
      { header: "Thành tiền chưa thuế", kind: "money" },
      { header: "Thuế suất GTGT (%)", kind: "number" },
      { header: "Tiền thuế GTGT", kind: "money" },
      { header: "Chiết khấu thương mại (cả đơn)", kind: "money" },
      { header: "Tổng thanh toán (cả đơn)", kind: "money" },
    ],
    rows: docs.flatMap((d) =>
      d.lines.map((l, i) => [d.orderNumber, d.date.slice(0, 10), d.templateNo, d.series, d.buyer.name, d.buyer.company, d.buyer.taxCode, d.buyer.address, d.buyer.email, d.payMethod, l.no, l.code, l.name, l.unit, l.qty, l.price, l.amount, l.vatPct, l.vat, i === 0 ? d.discount : null, i === 0 ? d.total : null]),
    ),
  };
}

function exporter(key: Exclude<EInvoiceProviderKey, "demo">, label: string): EInvoiceProvider {
  return {
    key,
    label: `${label} – xuất file để nhập`,
    mode: "export",
    async issue(doc) {
      return { status: "draft", series: doc.series, number: "", lookupCode: "", note: `Đã chuẩn bị file nhập cho ${label}. Phát hành trên phần mềm ${label} rồi ghi lại số hoá đơn.` };
    },
    async cancel() {
      return { ok: true, note: `Đánh dấu đã huỷ trong CRM. Việc huỷ/điều chỉnh hoá đơn thật thực hiện trên phần mềm ${label}.` };
    },
    async status(inv) {
      return { status: inv.status };
    },
    async exportFile(docs) {
      const data = await buildXlsx([importSheet(docs, label)]);
      const stamp = new Date().toISOString().slice(0, 10);
      return { name: `hoa-don-${key}-${stamp}.xlsx`, mime: XLSX_MIME, data };
    },
  };
}

export const EINVOICE_PROVIDERS: Record<EInvoiceProviderKey, EInvoiceProvider> = {
  demo,
  misa: exporter("misa", "MISA meInvoice"),
  viettel: exporter("viettel", "Viettel S-Invoice"),
  vnpt: exporter("vnpt", "VNPT Invoice"),
};

export const PROVIDER_LABEL: Record<EInvoiceProviderKey, string> = { demo: "Demo", misa: "MISA meInvoice", viettel: "Viettel S-Invoice", vnpt: "VNPT Invoice" };
export const isProviderKey = (k: string): k is EInvoiceProviderKey => k in EINVOICE_PROVIDERS;
