// Đổi kết quả đọc danh thiếp/CCCD sang các trường của bảng khách theo cấu hình hiện tại. Thuần, có kiểm thử.
import { z } from "zod";

export const Extracted = z.object({
  kind: z.enum(["business_card", "id_card", "other"]).describe("business_card = danh thiếp, id_card = CCCD/CMND, other = ảnh khác"),
  name: z.string().describe("Họ tên đầy đủ, viết hoa chữ cái đầu mỗi từ, có dấu"),
  phone: z.string().describe("Số điện thoại chính, chỉ chữ số và dấu +, rỗng nếu không có"),
  email: z.string(),
  company: z.string().describe("Tên công ty / tổ chức"),
  title: z.string().describe("Chức danh / vị trí"),
  address: z.string().describe("Địa chỉ (CCCD: nơi thường trú)"),
  birthday: z.string().describe("Ngày sinh dạng YYYY-MM-DD, rỗng nếu không có"),
  idNumber: z.string().describe("Số CCCD/CMND (chỉ chữ số), rỗng nếu không phải giấy tờ tuỳ thân"),
  gender: z.string().describe("Nam, Nữ hoặc rỗng"),
  note: z.string().describe("Thông tin khác hữu ích (website, số phụ, ngày cấp…), ngắn gọn"),
});
export type Extracted = z.infer<typeof Extracted>;
export type OcrKey = Exclude<keyof Extracted, "kind" | "name">;

export const OCR_LABEL: Record<OcrKey, string> = { phone: "Số điện thoại", email: "Email", company: "Công ty", title: "Chức danh", address: "Địa chỉ", birthday: "Ngày sinh", idNumber: "Số CCCD/CMND", gender: "Giới tính", note: "Ghi chú" };

type Field = { key: string; label: string; type: string; options: { label: string }[] };
export type Mapped = { key: string; label: string; type: string; source: OcrKey; value: string; options?: string[] };
export type MapResult = { title: string; fields: Mapped[]; dropped: { source: OcrKey; label: string; value: string }[] };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const text = (f: Field) => fold(`${f.key} ${f.label}`);

/** Nhận diện trường bằng kiểu và nhãn (không dấu). Thứ tự quan trọng: trường đặc thù trước, chung sau. */
const MATCH: Record<OcrKey, (f: Field) => boolean> = {
  phone: (f) => f.type === "phone" || (f.type === "text" && /(^|[\s_])(sdt|so dien thoai|dien thoai|phone|mobile)/.test(text(f))),
  email: (f) => f.type === "email" || (f.type === "text" && /e-?mail/.test(text(f))),
  idNumber: (f) => (f.type === "text" || f.type === "number") && /(cccd|cmnd|can cuoc|chung minh|giay to|id_?number|so_?id)/.test(text(f)),
  birthday: (f) => f.type === "date" && /(sinh|birth)/.test(text(f)),
  gender: (f) => (f.type === "select" || f.type === "text") && /(gioi tinh|gioi_tinh|gender)/.test(text(f)),
  company: (f) => f.type === "text" && /(cong ty|cong_ty|doanh nghiep|company|to chuc|don vi|noi lam viec)/.test(text(f)),
  title: (f) => f.type === "text" && /(chuc vu|chuc danh|chuc_vu|chuc_danh|vi tri|position|job)/.test(text(f)),
  address: (f) => (f.type === "text" || f.type === "longtext") && /(dia chi|dia_chi|address)/.test(text(f)),
  note: (f) => (f.type === "longtext" || f.type === "text") && /(ghi chu|ghi_chu|note|mo ta)/.test(text(f)),
};
const ORDER: OcrKey[] = ["phone", "email", "idNumber", "birthday", "gender", "company", "title", "address", "note"];

/** Ngày "DD/MM/YYYY" hoặc "YYYY-MM-DD" → "YYYY-MM-DD"; sai thì rỗng. */
export function isoDate(v: string) {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** Che số giấy tờ, chỉ chừa 4 số cuối. */
export const maskId = (v: string) => (v.length > 4 ? "•".repeat(v.length - 4) + v.slice(-4) : v);

export function mapToFields(x: Extracted, fields: Field[]): MapResult {
  const used = new Set<string>();
  const out: Mapped[] = [];
  const dropped: MapResult["dropped"] = [];
  const province = fields.find((f) => f.type === "select" && /(tinh|thanh pho|khu vuc|province|city)/.test(text(f)) && !/gioi/.test(text(f)));
  for (const src of ORDER) {
    let value = String(x[src] ?? "").trim();
    if (src === "birthday") value = isoDate(value);
    if (src === "idNumber") value = value.replace(/\D/g, "");
    if (!value) continue;
    const f = fields.find((ff) => !used.has(ff.key) && MATCH[src](ff));
    if (!f) {
      dropped.push({ source: src, label: OCR_LABEL[src], value });
      continue;
    }
    if (f.type === "select") {
      const opt = f.options.find((o) => fold(o.label) === fold(value));
      if (!opt) {
        dropped.push({ source: src, label: OCR_LABEL[src], value });
        continue;
      }
      value = opt.label;
    }
    used.add(f.key);
    out.push({ key: f.key, label: f.label, type: f.type, source: src, value, options: f.type === "select" ? f.options.map((o) => o.label) : undefined });
  }
  // Tỉnh/thành dạng lựa chọn: lấy từ địa chỉ (giúp luật giao theo khu vực).
  if (province && !used.has(province.key) && x.address) {
    const a = fold(x.address);
    const opt = province.options.find((o) => fold(o.label).length >= 2 && a.includes(fold(o.label)));
    if (opt) out.push({ key: province.key, label: province.label, type: "select", source: "address", value: opt.label, options: province.options.map((o) => o.label) });
  }
  return { title: x.name.trim(), fields: out, dropped };
}
