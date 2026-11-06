// Đọc / ghi file Excel thật (.xlsx) bằng exceljs. Chỉ dùng phía server.
import ExcelJS from "exceljs";
import type { FieldDef, ObjectDef } from "./config/schema";
import { evalField, isMoneyFormula } from "./formula";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MONEY_FMT = '#,##0 "₫"';
const NUMBER_FMT = "#,##0";
const DATE_FMT = "dd/mm/yyyy";
const DATETIME_FMT = "dd/mm/yyyy hh:mm";

/** Kiểu cột khi xuất: quyết định định dạng số, ngày, tiền. */
export type ColKind = "text" | "number" | "money" | "date" | "datetime" | "phone";
export type Column = { header: string; kind: ColKind };
export type Cell = string | number | Date | null | undefined;
export type SheetSpec = { name: string; columns: Column[]; rows: Cell[][] };

/** Tên sheet: tối đa 31 ký tự, không chứa : \ / ? * [ ] và không trùng nhau. */
function sheetName(name: string, used: Set<string>) {
  const base = (name.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet").slice(0, 31);
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 28)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

/** "2026-11-05" hoặc ISO → Date theo giờ UTC (Excel không có múi giờ). Không đọc được thì trả null. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const vn = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (vn) return new Date(Date.UTC(+vn[3], +vn[2] - 1, +vn[1]));
  return null;
}

const textLen = (v: Cell) => (v instanceof Date ? 16 : v == null ? 0 : typeof v === "number" ? String(Math.round(v)).length + Math.floor(String(Math.round(v)).length / 3) + 2 : String(v).length);

/** Tạo workbook: tiêu đề in đậm có nền, cố định hàng đầu, bật lọc, cột rộng theo nội dung. */
export async function buildXlsx(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DNA CRM";
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetName(s.name, used), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c, i) => {
      const longest = Math.max(textLen(c.header), ...s.rows.slice(0, 300).map((r) => Math.min(textLen(r[i]), 60)));
      return { header: c.header, key: `c${i}`, width: Math.max(10, Math.min(50, longest + 3)) };
    });
    for (const r of s.rows) {
      ws.addRow(
        s.columns.map((c, i) => {
          const v = r[i];
          if (v == null || v === "") return null;
          if (c.kind === "date") return toDate(v) ?? String(v);
          // Excel không có múi giờ: đổi về giờ địa phương của máy chủ (Docker đặt TZ=Asia/Ho_Chi_Minh).
          if (c.kind === "datetime" && v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60_000);
          if (c.kind === "money" || c.kind === "number") {
            const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
            return Number.isFinite(n) ? n : String(v);
          }
          return v instanceof Date ? v : String(v);
        }),
      );
    }
    s.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.kind === "money") col.numFmt = MONEY_FMT;
      else if (c.kind === "number") col.numFmt = NUMBER_FMT;
      else if (c.kind === "date") col.numFmt = DATE_FMT;
      else if (c.kind === "datetime") col.numFmt = DATETIME_FMT;
      else if (c.kind === "phone") col.numFmt = "@";
      if (c.kind === "money" || c.kind === "number") col.alignment = { horizontal: "right" };
    });
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FF323338" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E9EF" } };
    head.alignment = { vertical: "middle" };
    head.height = 22;
    if (s.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Kiểu cột ứng với kiểu trường của bảng. */
export function kindOf(f: Pick<FieldDef, "type">): ColKind {
  if (f.type === "money") return "money";
  if (f.type === "number" || f.type === "rating" || f.type === "checkbox" || f.type === "progress") return "number";
  if (f.type === "date") return "date";
  if (f.type === "phone") return "phone";
  return "text";
}

type Rec = { title: string; status: string; ownerName: string; amount: number; score: number; winProb?: number | null; data: Record<string, string | number>; createdAt: Date };

/** Giá trị đã tính của cột công thức (src/lib/formula.ts). Lỗi công thức → để trống. */
function formulaCell(f: FieldDef, r: Rec, obj: ObjectDef): Cell {
  const res = evalField(f, { ...r, createdAt: r.createdAt.toISOString() }, obj);
  if (!res.ok || res.value === null) return null;
  if (typeof res.value === "boolean") return res.value ? "Đúng" : "Sai";
  if (typeof res.value === "number" && !Number.isFinite(res.value)) return null;
  return res.value;
}

/** Một bảng CRM → một sheet, cùng thứ tự cột với file CSV cũ. Cột công thức xuất giá trị đã tính. */
export function recordsSheet(obj: ObjectDef, rows: Rec[]): SheetSpec {
  const fields = obj.fields;
  const columns: Column[] = [
    { header: obj.itemLabel, kind: "text" },
    { header: obj.statusLabel, kind: "text" },
    { header: "Phụ trách", kind: "text" },
    ...fields.map((f) => ({ header: f.label, kind: f.type === "formula" ? (isMoneyFormula(f, obj) ? "money" : "number") : kindOf(f) }) as Column),
    ...(obj.amountLabel ? [{ header: obj.amountLabel, kind: "money" as ColKind }] : []),
    ...(obj.key === "contacts" ? [{ header: "Điểm AI", kind: "number" as ColKind }] : []),
    { header: "Ngày tạo", kind: "datetime" },
  ];
  const body = rows.map((r) => [
    r.title,
    obj.statuses.find((s) => s.key === r.status)?.label ?? r.status,
    r.ownerName,
    ...fields.map((f) => (f.type === "formula" ? formulaCell(f, r, obj) : (r.data[f.key] ?? ""))),
    ...(obj.amountLabel ? [r.amount] : []),
    ...(obj.key === "contacts" ? [r.score] : []),
    r.createdAt,
  ]);
  // Cột công thức trả ngày / chữ thì đổi kiểu cột cho đúng để Excel định dạng chuẩn.
  fields.forEach((f, i) => {
    if (f.type !== "formula") return;
    const vals = body.map((b) => b[3 + i]).filter((v) => v != null && v !== "");
    if (vals.length && vals.every((v) => v instanceof Date)) columns[3 + i].kind = "date";
    else if (vals.some((v) => typeof v === "string" || v instanceof Date)) {
      columns[3 + i].kind = "text";
      body.forEach((b) => {
        const v = b[3 + i];
        if (v instanceof Date) b[3 + i] = v.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
      });
    }
  });
  return { name: obj.label, columns, rows: body };
}

/** File mẫu để học viên điền: dòng tiêu đề đúng tên cột + 2 dòng ví dụ + sheet hướng dẫn. */
export function templateSheets(obj: ObjectDef): SheetSpec[] {
  const fields = obj.fields.filter((f) => f.type !== "formula");
  const columns: Column[] = [
    { header: obj.itemLabel, kind: "text" },
    { header: obj.statusLabel, kind: "text" },
    { header: "Phụ trách", kind: "text" },
    ...fields.map((f) => ({ header: f.label, kind: kindOf(f) })),
    ...(obj.amountLabel ? [{ header: obj.amountLabel, kind: "money" as ColKind }] : []),
  ];
  const sample = (i: number): Cell[] => [
    i === 0 ? "Nguyễn Văn An" : "Trần Thị Bình",
    obj.statuses[0]?.label ?? "",
    "",
    ...fields.map((f) => {
      if (f.type === "phone") return i === 0 ? "0912345678" : "0987654321";
      if (f.type === "email") return i === 0 ? "an@email.vn" : "binh@email.vn";
      if (f.type === "money") return i === 0 ? 1500000 : 3000000;
      if (f.type === "number" || f.type === "rating") return i + 1;
      if (f.type === "date") return new Date(Date.UTC(2026, 0, 15 + i));
      if (f.type === "select" || f.type === "tags") return f.options[i]?.label ?? f.options[0]?.label ?? "";
      if (f.type === "checkbox") return i === 0 ? 1 : 0;
      if (f.type === "progress") return i === 0 ? 50 : 100;
      return "";
    }),
    ...(obj.amountLabel ? [i === 0 ? 2000000 : 5000000] : []),
  ];
  const guide: SheetSpec = {
    name: "Hướng dẫn",
    columns: [
      { header: "Cột", kind: "text" },
      { header: "Cách điền", kind: "text" },
    ],
    rows: [
      [obj.itemLabel, "Bắt buộc. Dòng trống tên sẽ bị bỏ qua."],
      [obj.statusLabel, `Một trong: ${obj.statuses.map((s) => s.label).join(", ")}. Để trống = ${obj.statuses[0]?.label ?? "trạng thái đầu"}.`],
      ["Phụ trách", "Tên nhân viên phụ trách, có thể để trống."],
      ...fields.map((f): Cell[] => [
        f.label,
        f.type === "phone"
          ? "Số điện thoại. CRM tự gộp khách trùng số (0912…, +84912…, 84912… coi là một)."
          : f.type === "date"
            ? "Ngày dạng dd/mm/yyyy hoặc định dạng ngày của Excel."
            : f.type === "money"
              ? "Số tiền VND, chỉ ghi số."
              : f.type === "select"
                ? `Một trong: ${f.options.map((o) => o.label).join(", ")}`
                : "Tuỳ ý.",
      ]),
      ["", "Xoá 2 dòng ví dụ trước khi nhập. Có thể đổi thứ tự cột: khi nhập bạn sẽ được ghép cột lại."],
    ],
  };
  return [{ name: obj.label, columns, rows: [sample(0), sample(1)] }, guide];
}

/** Giá trị một ô Excel → chuỗi. Ngày → yyyy-mm-dd, công thức → kết quả, chữ định dạng → chữ thường. */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return cellText((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("text" in v) return String((v as { text: unknown }).text ?? "").trim();
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/** Đọc sheet đầu tiên có dữ liệu của file .xlsx thành bảng chuỗi (dòng đầu là tiêu đề). */
export async function readXlsx(buf: ArrayBuffer | Uint8Array, maxRows = 20000): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((buf instanceof Uint8Array ? buf : new Uint8Array(buf)) as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return [];
  const width = ws.actualColumnCount || ws.columnCount;
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (out.length > maxRows) return;
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    if (cells.some((x) => x !== "")) out.push(cells);
  });
  // Bỏ cột trống ở cuối (do định dạng thừa).
  let w = Math.max(0, ...out.map((r) => r.reduce((m, x, i) => (x !== "" ? i + 1 : m), 0)));
  w = Math.max(w, 1);
  return out.map((r) => r.slice(0, w));
}

/** Nhận diện file .xlsx theo chữ ký ZIP (PK..). */
export const isXlsx = (buf: Uint8Array, name = "") => /\.xlsx$/i.test(name) || (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04);
