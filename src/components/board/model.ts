import type { FieldDef, ObjectDef, Option } from "@/lib/config/schema";
import type { FieldValue, RecordDTO } from "@/lib/records";
import { evalField, isMoneyFormula, numericFormula } from "@/lib/formula";
import { avatarColor } from "@/lib/colors";

export type Patch = Partial<Pick<RecordDTO, "title" | "status" | "ownerName" | "amount">> & { data?: Record<string, FieldValue> };
export type View = "table" | "kanban" | "calendar" | "gantt" | "chart";
/** Nhóm theo trạng thái, người phụ trách, hoặc một trường lựa chọn ("f:<khoá>"). */
export type GroupBy = "status" | "owner" | `f:${string}`;
/** Sắp xếp theo một cột bất kỳ (khoá giống filterFields: title, status, owner, f:<khoá>, amount…). */
export type ColSort = { col: string; dir: "asc" | "desc" };

// ---------- Cột của bảng chính ----------
export type Column =
  | { id: "owner"; label: string; w: number }
  | { id: "status"; label: string; w: number }
  | { id: string; label: string; w: number; field: FieldDef }
  | { id: "amount"; label: string; w: number }
  | { id: "winProb"; label: string; w: number }
  | { id: "score"; label: string; w: number }
  | { id: "updated"; label: string; w: number };

export const TITLE_W = 300;
const FIELD_W: Partial<Record<FieldDef["type"], number>> = { select: 150, formula: 150, longtext: 200, tags: 180, progress: 150, checkbox: 100, link: 170 };
export const CHECK_W = 36;

export function columnsOf(obj: ObjectDef): Column[] {
  const isDeals = !!obj.amountLabel;
  return [
    { id: "owner", label: "Phụ trách", w: 96 },
    { id: "status", label: obj.statusLabel, w: 150 },
    ...obj.fields.map((f) => ({ id: `f:${f.key}`, label: f.label, w: FIELD_W[f.type] ?? 140, field: f })),
    ...(isDeals ? [{ id: "amount", label: obj.amountLabel, w: 130 } as Column, { id: "winProb", label: "Khả năng chốt", w: 130 } as Column] : []),
    ...(obj.key === "contacts" ? [{ id: "score", label: "Điểm AI", w: 110 } as Column] : []),
    { id: "updated", label: "Cập nhật", w: 120 },
  ];
}

export const fieldOf = (c: Column): FieldDef | undefined => ("field" in c ? c.field : undefined);

// ---------- Công thức ----------
export function formulaOf(f: FieldDef, r: RecordDTO, obj: ObjectDef) {
  return evalField(f, r, obj);
}
export const formulaMoney = (f: FieldDef, obj: ObjectDef) => isMoneyFormula(f, obj);
export const formulaNumber = (f: FieldDef, r: RecordDTO, obj: ObjectDef) => numericFormula(evalField(f, r, obj));

// ---------- Lọc nâng cao ----------
export { OPS, filterFields, type FilterOp, type Filter, type FilterKind, type FilterField } from "./filters";
import type { Filter, FilterField } from "./filters";

export function rawValue(r: RecordDTO, key: string, obj: ObjectDef): FieldValue | null {
  if (key === "title") return r.title;
  if (key === "status") return r.status;
  if (key === "owner") return r.ownerName;
  if (key === "amount") return r.amount;
  if (key === "winProb") return r.winProb;
  if (key === "score") return r.score;
  if (key === "createdAt") return r.createdAt.slice(0, 10);
  if (key.startsWith("f:")) {
    const k = key.slice(2);
    const f = obj.fields.find((x) => x.key === k);
    if (f?.type === "formula") {
      const res = evalField(f, r, obj);
      return res.ok && (typeof res.value === "number" || typeof res.value === "string") ? res.value : null;
    }
    if (f?.type === "checkbox") return Number(r.data[k]) ? 1 : 0;
    return r.data[k] ?? null;
  }
  return null;
}

const isEmpty = (v: FieldValue | null) => v === null || v === undefined || String(v).trim() === "";
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function matchFilter(r: RecordDTO, f: Filter, ff: FilterField | undefined, obj: ObjectDef): boolean {
  if (!ff) return true;
  const v = rawValue(r, f.field, obj);
  if (f.op === "empty") return isEmpty(v);
  if (f.op === "not_empty") return !isEmpty(v);
  if (f.value === "" && f.op !== "is" && f.op !== "is_not") return true; // chưa nhập giá trị → bỏ qua
  if (ff.kind === "number") {
    if (isEmpty(v)) return false;
    const a = Number(v);
    const b = Number(f.value);
    if (isNaN(b)) return true;
    return f.op === "eq" ? a === b : f.op === "neq" ? a !== b : f.op === "gt" ? a > b : f.op === "gte" ? a >= b : f.op === "lt" ? a < b : f.op === "lte" ? a <= b : true;
  }
  if (ff.kind === "date") {
    if (isEmpty(v)) return false;
    const a = String(v).slice(0, 10);
    return f.op === "on" ? a === f.value : f.op === "before" ? a < f.value : f.op === "after" ? a > f.value : true;
  }
  if (ff.kind === "option") {
    if (f.value === "") return true;
    return f.op === "is" ? String(v ?? "") === f.value : f.op === "is_not" ? String(v ?? "") !== f.value : true;
  }
  const a = fold(String(v ?? ""));
  const b = fold(f.value);
  return f.op === "contains" ? a.includes(b) : f.op === "not_contains" ? !a.includes(b) : f.op === "is" ? a === b : true;
}

export function applyFilters(rows: RecordDTO[], filters: Filter[], mode: "and" | "or", fields: FilterField[], obj: ObjectDef) {
  const active = filters.filter((f) => f.op === "empty" || f.op === "not_empty" || f.value !== "");
  if (!active.length) return rows;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return rows.filter((r) => (mode === "and" ? active.every((f) => matchFilter(r, f, byKey.get(f.field), obj)) : active.some((f) => matchFilter(r, f, byKey.get(f.field), obj))));
}

// ---------- Nhóm ----------
export type Group = { key: string; label: string; color: string; match: (r: RecordDTO) => boolean; status?: string; owner?: string; field?: { key: string; value: string } };

/** Trường lựa chọn dùng được để nhóm (cột nhãn màu). */
export const groupableFields = (obj: ObjectDef) => obj.fields.filter((f) => f.type === "select" && f.options.length > 0);

export function groupsOf(obj: ObjectDef, team: string[], rows: RecordDTO[], by: GroupBy, colorOf: (o: Option) => string): Group[] {
  if (by.startsWith("f:")) {
    const f = groupableFields(obj).find((x) => `f:${x.key}` === by);
    if (f) {
      const labels = new Set(f.options.map((o) => o.label));
      return [
        ...f.options.map((o) => ({ key: `${by}:${o.label}`, label: o.label, color: colorOf(o), match: (r: RecordDTO) => String(r.data[f.key] ?? "") === o.label, field: { key: f.key, value: o.label } })),
        { key: `${by}:`, label: `Chưa có ${f.label.toLowerCase()}`, color: "#c4c4c4", match: (r: RecordDTO) => !labels.has(String(r.data[f.key] ?? "")) },
      ];
    }
    by = "status";
  }
  if (by === "status") return obj.statuses.map((s) => ({ key: s.key, label: s.label, color: colorOf(s), match: (r) => r.status === s.key, status: s.key }));
  const names = [...team];
  for (const r of rows) if (r.ownerName && !names.includes(r.ownerName)) names.push(r.ownerName);
  return [
    ...names.map((n) => ({ key: `o:${n}`, label: n, color: avatarColor(n), match: (r: RecordDTO) => r.ownerName === n, owner: n })),
    { key: "o:", label: "Chưa giao", color: "#c4c4c4", match: (r: RecordDTO) => !r.ownerName || !names.includes(r.ownerName), owner: "" },
  ];
}

// ---------- Độ cao dòng, tô màu theo điều kiện ----------
export type Density = "compact" | "normal" | "roomy";
export const ROW_HEIGHT: Record<Density, number> = { compact: 30, normal: 36, roomy: 46 };

/** Tô màu dòng khi một cột nhãn/người/ô tích có giá trị nhất định (giống conditional coloring). */
export type ColorRule = { id: string; field: string; value: string; color: string };
export const RULE_COLORS = ["#ffcb00", "#00c875", "#579bfc", "#a25ddc", "#ff642e", "#e2445c", "#66ccff", "#9cd326"];

/** Trường dùng được trong luật tô màu: các trường lọc dạng lựa chọn (trạng thái, người phụ trách, nhãn, ô tích). */
export const colorableFields = (fields: FilterField[]) => fields.filter((f) => f.kind === "option" && f.options?.length);

export function tintOf(r: RecordDTO, rules: ColorRule[], obj: ObjectDef): string | null {
  for (const rule of rules) {
    if (!rule.value) continue;
    const v = rawValue(r, rule.field, obj);
    if (String(v ?? "") === rule.value) return rule.color;
  }
  return null;
}

// ---------- Sắp xếp theo cột ----------
/** Khoá lọc/sắp xếp của một cột bảng (cột "updated" sắp theo ngày tạo vì không có trong bộ lọc). */
export const colKey = (c: Column) => ("field" in c ? `f:${c.field.key}` : c.id === "updated" ? "updatedAt" : c.id);

export function sortRows(rows: RecordDTO[], s: ColSort, obj: ObjectDef): RecordDTO[] {
  const val = (r: RecordDTO): FieldValue | null => (s.col === "updatedAt" ? r.updatedAt : rawValue(r, s.col, obj));
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const ex = x === null || x === undefined || x === "";
    const ey = y === null || y === undefined || y === "";
    if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1; // ô trống luôn nằm cuối
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    const nx = Number(x);
    const ny = Number(y);
    if (!isNaN(nx) && !isNaN(ny) && String(x).trim() !== "" && String(y).trim() !== "") return (nx - ny) * sign;
    return String(x).localeCompare(String(y), "vi") * sign;
  });
}

// ---------- Ngày ----------
export const DAY = 864e5;
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseYmd(s: string | number | undefined | null): Date | null {
  if (s === undefined || s === null || s === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m && String(s).length === 10) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(String(s));
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const diffDays = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY);

/** localStorage an toàn (chế độ ẩn danh/khối dữ liệu). */
export { readLS, writeLS } from "./ls";
