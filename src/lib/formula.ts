import * as formulajs from "@formulajs/formulajs";
import type { FieldDef, ObjectDef } from "./config/schema";

/**
 * Cột công thức kiểu Excel, chạy được cả trình duyệt lẫn server.
 * Tự viết bộ tách từ + phân tích đệ quy, KHÔNG dùng eval/new Function.
 * Tham chiếu: {key_truong}, {gia_tri} (giá trị), {diem} (điểm AI), {tao_luc} (ngày tạo),
 * {kha_nang_chot} (khả năng chốt %), {tieu_de}, {trang_thai}, {phu_trach}.
 * Hàm: mọi hàm của @formulajs/formulajs (SUM, IF, ROUND, DAYS, TODAY, CONCAT, AND, OR, MAX, MIN...).
 */

export type FormulaValue = number | string | boolean | Date | null;
export type FormulaResult = { ok: true; value: FormulaValue } | { ok: false; error: string };

/** Dạng tối thiểu của một bản ghi để tính công thức (khớp RecordDTO). */
export type FormulaRecord = {
  title: string;
  status: string;
  ownerName: string;
  amount: number;
  score: number;
  winProb?: number | null;
  createdAt: string;
  data: Record<string, string | number>;
};

export const BUILTIN_REFS: { key: string; label: string }[] = [
  { key: "gia_tri", label: "Giá trị" },
  { key: "diem", label: "Điểm AI" },
  { key: "tao_luc", label: "Ngày tạo" },
  { key: "kha_nang_chot", label: "Khả năng chốt (%)" },
  { key: "tieu_de", label: "Tiêu đề" },
  { key: "trang_thai", label: "Trạng thái" },
  { key: "phu_trach", label: "Người phụ trách" },
];

export class FormulaError extends Error {}

// ---------- Tách từ ----------
type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "("; v: "(" }
  | { t: ")"; v: ")" }
  | { t: ","; v: "," };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Số không hợp lệ ở vị trí ${i + 1}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "“" || ch === "”") {
      let s = "";
      i++;
      for (;;) {
        if (i >= src.length) throw new FormulaError("Thiếu dấu ngoặc kép đóng chuỗi");
        const c = src[i];
        if (c === '"' && src[i + 1] === '"') {
          s += '"';
          i += 2;
          continue;
        }
        if (c === '"' || c === "”" || c === "“") {
          i++;
          break;
        }
        s += c;
        i++;
      }
      out.push({ t: "str", v: s });
      continue;
    }
    if (ch === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new FormulaError("Thiếu dấu } đóng tham chiếu trường");
      const key = src.slice(i + 1, end).trim();
      if (!key) throw new FormulaError("Tham chiếu trường đang trống: {}");
      out.push({ t: "ref", v: key });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>" || two === "!=") {
      out.push({ t: "op", v: two === "!=" ? "<>" : two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      out.push({ t: ch, v: ch } as Tok);
      i++;
      continue;
    }
    if (ch === ";") {
      // Excel tiếng Việt hay dùng dấu chấm phẩy để ngăn tham số.
      out.push({ t: ",", v: "," });
      i++;
      continue;
    }
    throw new FormulaError(`Ký tự không hợp lệ “${ch}” ở vị trí ${i + 1}`);
  }
  return out;
}

// ---------- Cây cú pháp ----------
export type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "ref"; key: string }
  | { k: "un"; op: string; a: Node }
  | { k: "pct"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; name: string; args: Node[] };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (...ops: string[]) => peek()?.t === "op" && ops.includes(peek()!.v as string);

  // Thứ tự ưu tiên (thấp → cao): so sánh, &, + -, * /, ^, dấu âm, %.
  const comparison = (): Node => {
    let a = concat();
    while (isOp("=", "<>", "<", ">", "<=", ">=")) {
      const op = tokens[p++].v as string;
      a = { k: "bin", op, a, b: concat() };
    }
    return a;
  };
  const concat = (): Node => {
    let a = additive();
    while (isOp("&")) {
      p++;
      a = { k: "bin", op: "&", a, b: additive() };
    }
    return a;
  };
  const additive = (): Node => {
    let a = multiplicative();
    while (isOp("+", "-")) {
      const op = tokens[p++].v as string;
      a = { k: "bin", op, a, b: multiplicative() };
    }
    return a;
  };
  const multiplicative = (): Node => {
    let a = power();
    while (isOp("*", "/")) {
      const op = tokens[p++].v as string;
      a = { k: "bin", op, a, b: power() };
    }
    return a;
  };
  const power = (): Node => {
    let a = unary();
    while (isOp("^")) {
      p++;
      a = { k: "bin", op: "^", a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp("-", "+")) {
      const op = tokens[p++].v as string;
      return { k: "un", op, a: unary() };
    }
    return percent();
  };
  const percent = (): Node => {
    let a = primary();
    while (isOp("%")) {
      p++;
      a = { k: "pct", a };
    }
    return a;
  };
  const primary = (): Node => {
    const t = tokens[p];
    if (!t) throw new FormulaError("Biểu thức kết thúc đột ngột");
    p++;
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "ref") return { k: "ref", key: t.v };
    if (t.t === "(") {
      const e = comparison();
      if (peek()?.t !== ")") throw new FormulaError("Thiếu dấu ngoặc đóng )");
      p++;
      return e;
    }
    if (t.t === "id") {
      if (peek()?.t === "(") {
        p++;
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          for (;;) {
            args.push(comparison());
            if (peek()?.t === ",") {
              p++;
              continue;
            }
            break;
          }
        }
        if (peek()?.t !== ")") throw new FormulaError(`Thiếu dấu ) cho hàm ${t.v}`);
        p++;
        if (!isKnownFn(t.v)) throw new FormulaError(`Không có hàm ${t.v}`);
        return { k: "call", name: t.v, args };
      }
      if (t.v === "TRUE" || t.v === "DUNG") return { k: "bool", v: true };
      if (t.v === "FALSE" || t.v === "SAI") return { k: "bool", v: false };
      throw new FormulaError(`Không hiểu “${t.v}”. Tên trường phải đặt trong ngoặc nhọn, ví dụ {${t.v.toLowerCase()}}`);
    }
    throw new FormulaError(`Không mong đợi “${t.v}”`);
  };

  if (!tokens.length) throw new FormulaError("Công thức đang trống");
  const tree = comparison();
  if (p < tokens.length) throw new FormulaError(`Thừa “${tokens[p].v}” ở cuối biểu thức`);
  return tree;
}

// ---------- Hàm ----------
type Fn = (...args: unknown[]) => unknown;
const LIB = formulajs as unknown as Record<string, unknown>;
// Hàm tự xử lý để đánh giá lười (không tính nhánh không dùng).
const LAZY = new Set(["IF", "IFERROR", "IFS", "AND", "OR"]);

function isKnownFn(name: string) {
  return LAZY.has(name) || (/^[A-Z][A-Z0-9_.]*$/.test(name) && typeof LIB[name] === "function");
}

export function formulaFunctions() {
  return Object.keys(LIB).filter((k) => /^[A-Z][A-Z0-9_.]*$/.test(k) && typeof LIB[k] === "function");
}

// ---------- Biên dịch có cache ----------
const cache = new Map<string, { ok: true; ast: Node; refs: string[] } | { ok: false; error: string }>();

function collectRefs(n: Node, out: Set<string>) {
  if (n.k === "ref") out.add(n.key);
  else if (n.k === "un" || n.k === "pct") collectRefs(n.a, out);
  else if (n.k === "bin") {
    collectRefs(n.a, out);
    collectRefs(n.b, out);
  } else if (n.k === "call") n.args.forEach((a) => collectRefs(a, out));
}

/** Kiểm tra cú pháp; trả danh sách trường được tham chiếu. */
export function compileFormula(src: string) {
  const hit = cache.get(src);
  if (hit) return hit;
  let res: { ok: true; ast: Node; refs: string[] } | { ok: false; error: string };
  try {
    const ast = parse(tokenize(src.replace(/^\s*=/, "")));
    const refs = new Set<string>();
    collectRefs(ast, refs);
    res = { ok: true, ast, refs: [...refs] };
  } catch (e) {
    res = { ok: false, error: e instanceof Error ? e.message : "Công thức không hợp lệ" };
  }
  if (cache.size > 500) cache.clear();
  cache.set(src, res);
  return res;
}

/** Kiểm tra cú pháp + trường tham chiếu có tồn tại trong bảng. */
export function validateFormula(src: string, obj?: Pick<ObjectDef, "fields">, selfKey?: string): string | null {
  const c = compileFormula(src);
  if (!c.ok) return c.error;
  if (obj) {
    const known = new Set([...BUILTIN_REFS.map((b) => b.key), ...obj.fields.map((f) => f.key)]);
    const bad = c.refs.find((r) => !known.has(r));
    if (bad) return `Không có trường {${bad}}`;
    if (selfKey && c.refs.includes(selfKey)) return "Công thức không được tự tham chiếu chính nó";
  }
  return null;
}

// ---------- Đánh giá ----------
const DAY = 864e5;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (d: Date) => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - EXCEL_EPOCH) / DAY;

function toNum(v: FormulaValue): number {
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return toSerial(v);
  const n = Number(String(v).replace(/[\s,]/g, ""));
  if (isNaN(n)) throw new FormulaError(`“${v}” không phải là số`);
  return n;
}

function toStr(v: FormulaValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toLocaleDateString("vi-VN");
  if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10);
  return v;
}

function toBool(v: FormulaValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const u = v.trim().toUpperCase();
    if (u === "TRUE") return true;
    if (u === "FALSE" || u === "") return false;
  }
  return toNum(v) !== 0;
}

function compare(a: FormulaValue, b: FormulaValue): number {
  const numLike = (v: FormulaValue) => typeof v === "number" || v instanceof Date || typeof v === "boolean" || v === null;
  if (numLike(a) && numLike(b)) return toNum(a) - toNum(b);
  return toStr(a).localeCompare(toStr(b), "vi", { sensitivity: "base" });
}

function fromLib(v: unknown): FormulaValue {
  if (v instanceof Error) throw new FormulaError(v.message || "Lỗi trong hàm");
  if (v === undefined) return null;
  if (typeof v === "number") {
    if (!isFinite(v)) throw new FormulaError("Kết quả không phải số hữu hạn");
    return v;
  }
  if (typeof v === "string" || typeof v === "boolean" || v === null || v instanceof Date) return v;
  if (Array.isArray(v)) return fromLib(v[0]);
  return String(v);
}

const toLibArg = (v: FormulaValue) => (v === null ? 0 : v);

type Scope = { get: (key: string) => FormulaValue };

function evaluate(n: Node, s: Scope): FormulaValue {
  switch (n.k) {
    case "num":
    case "str":
    case "bool":
      return n.v;
    case "ref":
      return s.get(n.key);
    case "un": {
      const v = toNum(evaluate(n.a, s));
      return n.op === "-" ? -v : v;
    }
    case "pct":
      return toNum(evaluate(n.a, s)) / 100;
    case "bin": {
      const a = evaluate(n.a, s);
      const b = evaluate(n.b, s);
      switch (n.op) {
        case "+":
          // Ngày + số ngày → vẫn là ngày.
          if (a instanceof Date && !(b instanceof Date)) return new Date(a.getTime() + toNum(b) * DAY);
          return toNum(a) + toNum(b);
        case "-":
          if (a instanceof Date && !(b instanceof Date)) return new Date(a.getTime() - toNum(b) * DAY);
          if (a instanceof Date && b instanceof Date) return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
          return toNum(a) - toNum(b);
        case "*":
          return toNum(a) * toNum(b);
        case "/": {
          const d = toNum(b);
          if (d === 0) throw new FormulaError("Chia cho 0");
          return toNum(a) / d;
        }
        case "^":
          return Math.pow(toNum(a), toNum(b));
        case "&":
          return toStr(a) + toStr(b);
        case "=":
          return compare(a, b) === 0;
        case "<>":
          return compare(a, b) !== 0;
        case "<":
          return compare(a, b) < 0;
        case ">":
          return compare(a, b) > 0;
        case "<=":
          return compare(a, b) <= 0;
        case ">=":
          return compare(a, b) >= 0;
      }
      throw new FormulaError(`Phép toán lạ ${n.op}`);
    }
    case "call": {
      const args = n.args;
      if (n.name === "IF") {
        if (args.length < 2 || args.length > 3) throw new FormulaError("IF cần 2 hoặc 3 tham số: IF(điều_kiện, khi_đúng, khi_sai)");
        return toBool(evaluate(args[0], s)) ? evaluate(args[1], s) : args[2] ? evaluate(args[2], s) : false;
      }
      if (n.name === "IFERROR") {
        if (args.length !== 2) throw new FormulaError("IFERROR cần 2 tham số");
        try {
          return evaluate(args[0], s);
        } catch {
          return evaluate(args[1], s);
        }
      }
      if (n.name === "IFS") {
        for (let i = 0; i + 1 < args.length; i += 2) if (toBool(evaluate(args[i], s))) return evaluate(args[i + 1], s);
        throw new FormulaError("IFS không có điều kiện nào đúng");
      }
      if (n.name === "AND") {
        if (!args.length) throw new FormulaError("AND cần ít nhất 1 tham số");
        return args.every((a) => toBool(evaluate(a, s)));
      }
      if (n.name === "OR") {
        if (!args.length) throw new FormulaError("OR cần ít nhất 1 tham số");
        return args.some((a) => toBool(evaluate(a, s)));
      }
      const fn = LIB[n.name] as Fn;
      const vals = args.map((a) => toLibArg(evaluate(a, s)));
      try {
        return fromLib(fn(...vals));
      } catch (e) {
        if (e instanceof FormulaError) throw e;
        throw new FormulaError(`Lỗi trong hàm ${n.name}`);
      }
    }
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function parseDate(v: string | number | undefined): Date | null {
  if (v === undefined || v === "") return null;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  // Ngày dạng YYYY-MM-DD hiểu theo giờ địa phương để DAYS/TODAY khớp.
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Đánh giá một biểu thức trên bản ghi. Công thức có thể tham chiếu cột công thức khác (chặn vòng lặp). */
export function evalFormula(src: string, rec: FormulaRecord, obj?: Pick<ObjectDef, "fields" | "statuses">, _stack: string[] = []): FormulaResult {
  const c = compileFormula(src);
  if (!c.ok) return { ok: false, error: c.error };
  const fields = new Map((obj?.fields ?? []).map((f) => [f.key, f]));
  const scope: Scope = {
    get(key) {
      switch (key) {
        case "gia_tri":
          return rec.amount ?? 0;
        case "diem":
          return rec.score ?? 0;
        case "tao_luc":
          return parseDate(rec.createdAt);
        case "kha_nang_chot":
          return rec.winProb ?? null;
        case "tieu_de":
          return rec.title;
        case "trang_thai":
          return obj?.statuses.find((x) => x.key === rec.status)?.label ?? rec.status;
        case "phu_trach":
          return rec.ownerName;
      }
      const f = fields.get(key);
      if (!f && obj) throw new FormulaError(`Không có trường {${key}}`);
      if (f?.type === "formula") {
        if (_stack.includes(key) || _stack.length > 8) throw new FormulaError("Công thức tham chiếu vòng tròn");
        const r = evalFormula(f.formula ?? "", rec, obj, [..._stack, key]);
        if (!r.ok) throw new FormulaError(`{${key}}: ${r.error}`);
        return r.value;
      }
      const raw = rec.data[key];
      if (raw === undefined || raw === "") return f && (f.type === "number" || f.type === "money" || f.type === "rating") ? 0 : f?.type === "date" ? null : "";
      if (f?.type === "date") return parseDate(raw);
      if (f && (f.type === "number" || f.type === "money" || f.type === "rating")) return Number(raw) || 0;
      return raw;
    },
  };
  try {
    return { ok: true, value: evaluate(c.ast, scope) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi công thức" };
  }
}

/** Tính giá trị của một cột công thức. */
export function evalField(field: Pick<FieldDef, "key" | "formula">, rec: FormulaRecord, obj?: Pick<ObjectDef, "fields" | "statuses">): FormulaResult {
  if (!field.formula?.trim()) return { ok: false, error: "Chưa nhập công thức" };
  return evalFormula(field.formula, rec, obj, [field.key]);
}

/** Công thức nên hiển thị dạng tiền khi dùng {gia_tri} hoặc trường kiểu tiền. */
export function isMoneyFormula(field: Pick<FieldDef, "formula">, obj?: Pick<ObjectDef, "fields">, _seen: string[] = []): boolean {
  const c = compileFormula(field.formula ?? "");
  if (!c.ok) return false;
  return c.refs.some((r) => {
    if (r === "gia_tri") return true;
    const f = obj?.fields.find((x) => x.key === r);
    if (f?.type === "money") return true;
    return f?.type === "formula" && !_seen.includes(r) && isMoneyFormula(f, obj, [..._seen, r]);
  });
}

/** Chuỗi hiển thị cho kết quả công thức (dùng cho ô, xuất Excel). */
export function formatFormulaValue(v: FormulaValue, opts: { money?: boolean; vnd?: (n: number) => string } = {}): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "Đúng" : "Sai";
  if (v instanceof Date) return v.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  if (typeof v === "number") {
    if (opts.money && opts.vnd) return opts.vnd(v);
    return (Math.round(v * 100) / 100).toLocaleString("vi-VN");
  }
  return v;
}

/** Giá trị số của cột công thức (để cộng dòng tổng), null nếu không phải số. */
export function numericFormula(r: FormulaResult): number | null {
  return r.ok && typeof r.value === "number" ? r.value : null;
}
