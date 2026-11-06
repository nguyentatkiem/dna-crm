// Định nghĩa bộ lọc thuần (không kéo bộ tính công thức @formulajs ~43KB): dùng chung cho bảng và trang Phân khúc.
import type { ObjectDef } from "@/lib/config/schema";
import { RFM_FILTER_FIELD } from "@/lib/c360/rfm";

export type FilterOp = "contains" | "not_contains" | "is" | "is_not" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "before" | "after" | "on" | "empty" | "not_empty";
export type Filter = { id: string; field: string; op: FilterOp; value: string };
export type FilterKind = "text" | "number" | "date" | "option";

export type FilterField = { key: string; label: string; kind: FilterKind; options?: { value: string; label: string }[] };

export const OPS: Record<FilterKind, { op: FilterOp; label: string }[]> = {
  text: [
    { op: "contains", label: "có chứa" },
    { op: "not_contains", label: "không chứa" },
    { op: "is", label: "là" },
    { op: "empty", label: "đang trống" },
    { op: "not_empty", label: "không trống" },
  ],
  number: [
    { op: "eq", label: "=" },
    { op: "neq", label: "≠" },
    { op: "gt", label: ">" },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<" },
    { op: "lte", label: "≤" },
    { op: "empty", label: "đang trống" },
  ],
  date: [
    { op: "on", label: "vào ngày" },
    { op: "before", label: "trước ngày" },
    { op: "after", label: "sau ngày" },
    { op: "empty", label: "đang trống" },
    { op: "not_empty", label: "không trống" },
  ],
  option: [
    { op: "is", label: "là" },
    { op: "is_not", label: "không phải" },
    { op: "empty", label: "đang trống" },
    { op: "not_empty", label: "không trống" },
  ],
};

export function filterFields(obj: ObjectDef, team: string[]): FilterField[] {
  const out: FilterField[] = [
    { key: "title", label: obj.itemLabel, kind: "text" },
    { key: "status", label: obj.statusLabel, kind: "option", options: obj.statuses.map((s) => ({ value: s.key, label: s.label })) },
    { key: "owner", label: "Phụ trách", kind: "option", options: [...team.map((t) => ({ value: t, label: t }))] },
  ];
  for (const f of obj.fields) {
    if (f.type === "checkbox") {
      out.push({ key: `f:${f.key}`, label: f.label, kind: "option", options: [{ value: "1", label: "Đã tích" }, { value: "0", label: "Chưa tích" }] });
      continue;
    }
    // Thẻ nhiều lựa chọn lọc kiểu chữ: "có chứa" một thẻ.
    const kind: FilterKind = f.type === "number" || f.type === "money" || f.type === "rating" || f.type === "progress" || f.type === "formula" ? "number" : f.type === "date" ? "date" : f.type === "select" ? "option" : "text";
    out.push({ key: `f:${f.key}`, label: f.label, kind, options: f.type === "select" ? f.options.map((o) => ({ value: o.label, label: o.label })) : undefined });
  }
  if (obj.amountLabel) {
    out.push({ key: "amount", label: obj.amountLabel, kind: "number" });
    out.push({ key: "winProb", label: "Khả năng chốt (%)", kind: "number" });
  }
  if (obj.key === "contacts") out.push({ key: "score", label: "Điểm AI", kind: "number" }, RFM_FILTER_FIELD);
  out.push({ key: "createdAt", label: "Ngày tạo", kind: "date" });
  return out;
}

