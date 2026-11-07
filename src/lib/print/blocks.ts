// Mẫu in kéo thả: kiểu khối, tuỳ chọn, mẫu mặc định và biến chữ. Thuần (client + server + kiểm thử).
import { z } from "zod";
import { totals as calcTotals, type Line } from "@/lib/sales/lines";

export type DocType = "quote" | "order" | "contract";
export const DOC_TYPES: DocType[] = ["quote", "order", "contract"];
export const DOC_LABEL: Record<DocType, string> = { quote: "Báo giá", order: "Đơn hàng", contract: "Hợp đồng" };

export type BlockType = "company" | "title" | "customer" | "items" | "totals" | "terms" | "note" | "qr" | "signatures" | "text" | "pagebreak" | "footer";
export type Align = "left" | "center" | "right";
export type Size = "sm" | "md" | "lg";
export type OptVal = string | boolean | number;
export type Block = { id: string; type: BlockType; hidden?: boolean; align?: Align; size?: Size; opts?: Record<string, OptVal> };

type OptDef = { key: string; label: string; kind: "bool" | "text" | "textarea" | "number"; def: OptVal; hint?: string };
type Meta = { label: string; desc: string; opts: OptDef[]; align?: boolean; size?: boolean };

export const BLOCKS: Record<BlockType, Meta> = {
  company: {
    label: "Logo & thông tin công ty",
    desc: "Tên, logo, địa chỉ, điện thoại, MST (Cài đặt → Thông tin doanh nghiệp).",
    align: true,
    size: true,
    opts: [
      { key: "logo", label: "Hiện logo", kind: "bool", def: true },
      { key: "address", label: "Hiện địa chỉ", kind: "bool", def: true },
      { key: "contact", label: "Hiện điện thoại, email, MST", kind: "bool", def: true },
    ],
  },
  title: {
    label: "Tiêu đề & số chứng từ",
    desc: "Đặt ngay sau khối công ty và căn phải để nằm cùng hàng như mẫu gốc.",
    align: true,
    size: true,
    opts: [
      { key: "text", label: "Tiêu đề", kind: "text", def: "", hint: "Để trống = tên loại chứng từ" },
      { key: "number", label: "Hiện số chứng từ", kind: "bool", def: true },
      { key: "date", label: "Hiện ngày", kind: "bool", def: true },
    ],
  },
  customer: {
    label: "Thông tin khách",
    desc: "Tên, liên hệ của khách; bên phải là tiêu đề/hiệu lực/thời hạn.",
    size: true,
    opts: [
      { key: "label", label: "Nhãn", kind: "text", def: "Kính gửi" },
      { key: "contact", label: "Hiện SĐT, email", kind: "bool", def: true },
      { key: "ship", label: "Hiện địa chỉ giao hàng", kind: "bool", def: true },
      { key: "meta", label: "Hiện tiêu đề / hiệu lực / thời hạn", kind: "bool", def: true },
    ],
  },
  items: {
    label: "Bảng hàng",
    desc: "Bật/tắt từng cột.",
    size: true,
    opts: [
      { key: "colCode", label: "Cột mã", kind: "bool", def: false },
      { key: "colUnit", label: "Cột ĐVT", kind: "bool", def: false },
      { key: "subLine", label: "Ghi mã · ĐVT dưới tên", kind: "bool", def: true },
      { key: "colQty", label: "Cột SL", kind: "bool", def: true },
      { key: "colPrice", label: "Cột đơn giá", kind: "bool", def: true },
      { key: "colDiscount", label: "Cột CK", kind: "bool", def: true },
      { key: "colVat", label: "Cột VAT", kind: "bool", def: true },
      { key: "colAmount", label: "Cột thành tiền", kind: "bool", def: true },
    ],
  },
  totals: {
    label: "Tổng tiền + bằng chữ",
    desc: "Cộng tiền hàng, chiết khấu, VAT, tổng cộng.",
    align: true,
    size: true,
    opts: [
      { key: "words", label: "Ghi bằng chữ", kind: "bool", def: true },
      { key: "paid", label: "Hiện đã thu / còn nợ (đơn hàng)", kind: "bool", def: false },
    ],
  },
  terms: {
    label: "Điều khoản",
    desc: "Điều khoản của chứng từ và thông tin chuyển khoản.",
    size: true,
    opts: [
      { key: "title", label: "Tiêu đề", kind: "text", def: "Điều khoản" },
      { key: "bank", label: "Kèm thông tin chuyển khoản", kind: "bool", def: true },
    ],
  },
  note: { label: "Ghi chú", desc: "Ghi chú của chứng từ.", size: true, align: true, opts: [{ key: "title", label: "Tiêu đề", kind: "text", def: "" }] },
  qr: {
    label: "Mã QR thanh toán",
    desc: "VietQR cho đơn hàng (báo giá: QR của đơn đã tạo từ báo giá, nếu có).",
    align: true,
    opts: [
      { key: "size", label: "Cỡ (px)", kind: "number", def: 140 },
      { key: "info", label: "Hiện thông tin tài khoản", kind: "bool", def: true },
    ],
  },
  signatures: {
    label: "Chữ ký",
    desc: "Hai ô ký bên mua / bên bán.",
    size: true,
    opts: [
      { key: "left", label: "Ô trái", kind: "text", def: "Đại diện khách hàng" },
      { key: "right", label: "Ô phải", kind: "text", def: "Đại diện {ten_cong_ty}" },
      { key: "seller", label: "Ghi tên người lập dưới ô phải", kind: "bool", def: true },
    ],
  },
  text: {
    label: "Văn bản tự do",
    desc: "Dùng biến như {ten_khach}, {so_chung_tu}, {ngay}, {tong_tien}.",
    align: true,
    size: true,
    opts: [
      { key: "title", label: "Tiêu đề", kind: "text", def: "" },
      { key: "text", label: "Nội dung", kind: "textarea", def: "" },
    ],
  },
  pagebreak: { label: "Ngăn trang", desc: "Sang trang mới khi in.", opts: [] },
  footer: { label: "Chân trang", desc: "Dòng chân trang (Thông tin doanh nghiệp → chân trang).", align: true, size: true, opts: [{ key: "text", label: "Nội dung", kind: "text", def: "", hint: "Để trống = chân trang của doanh nghiệp" }] },
};
export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

/** Đọc tuỳ chọn của khối, thiếu thì lấy mặc định. */
export function opt<T extends OptVal>(b: Block, key: string): T {
  const v = b.opts?.[key];
  if (v !== undefined) return v as T;
  return (BLOCKS[b.type]?.opts.find((o) => o.key === key)?.def ?? "") as T;
}

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const newBlock = (type: BlockType, opts?: Record<string, OptVal>, extra?: Partial<Block>): Block => ({ id: newId(), type, ...extra, ...(opts ? { opts } : {}) });

const b = (id: string, type: BlockType, extra: Partial<Block> = {}): Block => ({ id, type, ...extra });

/** Mẫu gốc từng loại — trông như trang in trước khi có mẫu tuỳ biến. */
export function builtinLayout(docType: DocType): Block[] {
  if (docType === "order") {
    return [
      b("company", "company"),
      b("title", "title", { align: "right", opts: { text: "Đơn hàng" } }),
      b("customer", "customer", { opts: { label: "Khách hàng" } }),
      b("items", "items"),
      b("totals", "totals", { opts: { words: true, paid: true } }),
      b("note", "note"),
      b("qr", "qr"),
      b("terms", "terms", { opts: { title: "Điều khoản", bank: true } }),
      b("sign", "signatures", { opts: { left: "Người nhận hàng", right: "Đại diện {ten_cong_ty}", seller: true } }),
      b("footer", "footer"),
    ];
  }
  if (docType === "contract") {
    return [
      b("company", "company"),
      b("title", "title", { align: "right", opts: { text: "Hợp đồng" } }),
      b("customer", "customer", { opts: { label: "Bên mua (Bên B)", ship: false } }),
      b("body", "text", {
        opts: {
          title: "Nội dung",
          text: "Hai bên thống nhất ký kết hợp đồng “{tieu_de}” với tổng giá trị {gia_tri_hd} ({gia_tri_chu}).\nThời hạn hợp đồng: từ {ngay_bat_dau} đến {ngay_ket_thuc}.",
        },
      }),
      b("items", "items"),
      b("totals", "totals"),
      b("note", "note", { opts: { title: "Ghi chú" } }),
      b("terms", "terms", { opts: { title: "Điều khoản", bank: true } }),
      b("sign", "signatures", { opts: { left: "Đại diện bên B", right: "Đại diện bên A ({ten_cong_ty})", seller: true } }),
      b("footer", "footer"),
    ];
  }
  return [
    b("company", "company"),
    b("title", "title", { align: "right", opts: { text: "Báo giá" } }),
    b("customer", "customer"),
    b("items", "items"),
    b("totals", "totals"),
    b("note", "note"),
    b("terms", "terms"),
    b("sign", "signatures"),
    b("footer", "footer"),
  ];
}

const OptValZ = z.union([z.string().max(5000), z.boolean(), z.number()]);
const BlockZ = z.object({
  id: z.string().min(1).max(60),
  type: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]),
  hidden: z.boolean().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  size: z.enum(["sm", "md", "lg"]).optional(),
  opts: z.record(z.string().max(40), OptValZ).optional(),
});
export const LayoutSchema = z.array(BlockZ).max(60);

/** Đọc layoutJson an toàn: khối hỏng bị bỏ; rỗng/hỏng hẳn → mẫu gốc. */
export function parseLayout(json: string | null | undefined, docType: DocType): Block[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return builtinLayout(docType);
  }
  if (!Array.isArray(raw) || !raw.length) return builtinLayout(docType);
  const out = raw.flatMap((r) => {
    const p = BlockZ.safeParse(r);
    return p.success ? [p.data as Block] : [];
  });
  return out.length ? out.slice(0, 60) : builtinLayout(docType);
}

export const TemplateInput = z.object({
  docType: z.enum(DOC_TYPES as [DocType, ...DocType[]]),
  name: z.string().trim().min(1, "Cần đặt tên mẫu").max(120),
  layout: LayoutSchema.optional(),
  isDefault: z.boolean().optional(),
  fromId: z.string().max(60).optional(),
});

// ---------------- Dữ liệu chứng từ để in ----------------
export type PrintCompany = { name: string; address: string; phone: string; email: string; taxCode: string; bank: string; logoUrl: string; footer: string };
export type PrintData = {
  docType: DocType;
  number: string;
  title: string;
  date: string | Date;
  validUntil?: string | Date | null;
  customer: { name: string; phone: string; email: string; address: string };
  items: Line[];
  totals: { subtotal: number; discount: number; vatTotal: number; total: number };
  paid?: number;
  note: string;
  terms: string;
  createdBy: string;
  /** Đơn hàng để hiện mã QR (báo giá: đơn tạo từ báo giá). */
  orderId?: string | null;
  contract?: { value: number; startAt: string | Date | null; endAt: string | Date | null; signedAt: string | Date | null };
};

export const VARIABLES: [string, string][] = [
  ["ten_khach", "Tên khách"],
  ["sdt_khach", "SĐT khách"],
  ["email_khach", "Email khách"],
  ["dia_chi_khach", "Địa chỉ khách/giao hàng"],
  ["so_chung_tu", "Số chứng từ"],
  ["ngay", "Ngày chứng từ"],
  ["tieu_de", "Tiêu đề"],
  ["tong_tien", "Tổng tiền"],
  ["tong_tien_chu", "Tổng tiền bằng chữ"],
  ["da_thu", "Đã thu"],
  ["con_no", "Còn nợ"],
  ["hieu_luc", "Hiệu lực đến (báo giá)"],
  ["gia_tri_hd", "Giá trị hợp đồng"],
  ["gia_tri_chu", "Giá trị HĐ bằng chữ"],
  ["ngay_bat_dau", "Ngày bắt đầu HĐ"],
  ["ngay_ket_thuc", "Ngày kết thúc HĐ"],
  ["ngay_ky", "Ngày ký HĐ"],
  ["ten_cong_ty", "Tên công ty"],
  ["nguoi_lap", "Người lập"],
];

/** Thay {bien} bằng giá trị; biến không biết giữ nguyên để người soạn thấy mình gõ sai. */
export function fillVars(text: string, vars: Record<string, string>) {
  return String(text ?? "").replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Mẫu demo cho trình soạn khi workspace chưa có chứng từ nào. */
export function sampleData(docType: DocType): PrintData {
  const items: Line[] = [
    { code: "SP01", name: "Serum Vitamin C 30ml", unit: "chai", qty: 2, price: 690000, discountPct: 0, vatPct: 10 },
    { code: "DV10", name: "Liệu trình chăm sóc da 10 buổi", unit: "gói", qty: 1, price: 3900000, discountPct: 5, vatPct: 8 },
  ];
  return {
    docType,
    number: docType === "quote" ? "BG-2026-0001" : docType === "order" ? "DH-2026-0001" : "HD-2026-0001",
    title: docType === "contract" ? "Hợp đồng dịch vụ chăm sóc da" : "Gói chăm sóc da",
    date: new Date().toISOString(),
    validUntil: new Date(Date.now() + 15 * 864e5).toISOString(),
    customer: { name: "Chị Nguyễn Thu Hà", phone: "0901 234 567", email: "ha.nguyen@example.com", address: "12 Lê Lợi, Quận 1, TP.HCM" },
    items,
    totals: calcTotals(items),
    paid: docType === "order" ? 2000000 : undefined,
    note: "Giao hàng trong giờ hành chính.",
    terms: "Báo giá có hiệu lực trong 15 ngày.",
    createdBy: "Lan",
    orderId: null,
    contract: docType === "contract" ? { value: calcTotals(items).total, startAt: new Date().toISOString(), endAt: new Date(Date.now() + 365 * 864e5).toISOString(), signedAt: new Date().toISOString() } : undefined,
  };
}
