// Kiểm tra dữ liệu gửi lên API bán hàng.
import { z } from "zod";
import { LinesSchema } from "./lines";
import { CONTRACT_STATUSES, ORDER_STATUSES, PAY_METHODS } from "./shared";

const str = (max: number) => z.string().trim().max(max).catch("");
const optId = z.string().max(60).nullish().transform((v) => v || null);
/** Ngày từ input (YYYY-MM-DD hoặc ISO); rỗng = null. */
export const dateIn = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, c) => {
    if (v === undefined) return undefined;
    if (!v) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v);
    if (isNaN(d.getTime())) {
      c.addIssue({ code: "custom", message: "Ngày không hợp lệ" });
      return z.NEVER;
    }
    return d;
  });

export const ProductInput = z.object({
  code: str(60),
  name: z.string().trim().min(1, "Cần nhập tên sản phẩm").max(200),
  unit: str(40),
  category: str(80),
  price: z.coerce.number().min(0).max(1e13),
  vat: z.coerce.number().min(0).max(100).catch(0),
  warrantyMonths: z.coerce.number().int().min(0).max(600).catch(0),
  description: str(2000),
  active: z.boolean().optional(),
});

const docBase = {
  contactId: optId,
  recordId: optId,
  customerName: z.string().trim().min(1, "Cần chọn hoặc nhập tên khách").max(200),
  customerPhone: str(40),
  items: LinesSchema.min(1, "Cần ít nhất một dòng hàng"),
  discount: z.coerce.number().min(0).max(1e13).catch(0),
  note: str(3000),
};

export const QuoteInput = z.object({
  ...docBase,
  customerEmail: str(200),
  title: str(200),
  validUntil: dateIn,
  terms: str(5000),
  intent: z.enum(["draft", "submit"]).catch("draft"),
});

export const OrderInput = z.object({ ...docBase, dueAt: dateIn });

export const OrderPatch = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]]).optional(),
  dueAt: dateIn,
  note: z.string().max(3000).optional(),
});

export const PaymentInput = z.object({
  amount: z.coerce.number().positive("Số tiền phải lớn hơn 0").max(1e13),
  method: z.enum(PAY_METHODS as [string, ...string[]]).catch("transfer"),
  paidAt: dateIn,
  note: str(500),
});

export const ContractInput = z.object({
  title: z.string().trim().min(1, "Cần nhập tên hợp đồng").max(200),
  contactId: optId,
  recordId: optId,
  orderId: optId,
  customerName: str(200),
  value: z.coerce.number().min(0).max(1e13).catch(0),
  status: z.enum(CONTRACT_STATUSES as [string, ...string[]]).catch("draft"),
  signedAt: dateIn,
  startAt: dateIn,
  endAt: dateIn,
  remindDays: z.coerce.number().int().min(0).max(365).catch(30),
  fileUrl: str(1000),
  note: str(3000),
});

export const CompanyInput = z.object({
  name: str(200),
  address: str(400),
  phone: str(60),
  email: str(200),
  taxCode: str(40),
  bank: str(400),
  logoUrl: str(1000),
  quoteTerms: str(5000),
  footer: str(1000),
});

/** Thông báo lỗi Zod đầu tiên bằng tiếng Việt cho người dùng. */
export function firstError(e: z.ZodError) {
  const i = e.issues[0];
  if (!i) return "Dữ liệu chưa hợp lệ";
  return i.code === "custom" || i.message.match(/[À-ỹ]/) || i.message.startsWith("Cần") ? i.message : `Dữ liệu chưa hợp lệ (${i.path.join(".")})`;
}
