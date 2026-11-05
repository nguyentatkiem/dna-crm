import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ObjectDef } from "@/lib/config/schema";
import { buildXlsx, readXlsx, recordsSheet, templateSheets, toDate } from "@/lib/xlsx";

const obj: ObjectDef = {
  key: "deals",
  label: "Đơn hàng",
  itemLabel: "Đơn",
  description: "",
  statusLabel: "Giai đoạn",
  statuses: [
    { key: "moi", label: "Mới", color: "blue" },
    { key: "thang", label: "Thắng", color: "green" },
  ],
  fields: [
    { key: "sdt", label: "SĐT", type: "phone", options: [] },
    { key: "so_luong", label: "Số lượng", type: "number", options: [] },
    { key: "don_gia", label: "Đơn giá", type: "money", options: [] },
    { key: "ngay", label: "Ngày giao", type: "date", options: [] },
    { key: "thanh_tien", label: "Thành tiền", type: "formula", options: [], formula: "{so_luong} * {don_gia}" },
  ],
  amountLabel: "Giá trị",
};

type Row = Parameters<typeof recordsSheet>[1][number];
const rows: Row[] = [
  { title: "Đơn A", status: "thang", ownerName: "Lan", amount: 3000000, score: 0, data: { sdt: "0912345678", so_luong: 2, don_gia: 1500000, ngay: "2026-03-15" }, createdAt: new Date("2026-03-01T03:00:00Z") },
  { title: "Đơn B", status: "moi", ownerName: "", amount: 0, score: 0, data: { sdt: "0987654321", so_luong: 1, don_gia: 99000 }, createdAt: new Date("2026-03-02T03:00:00Z") },
];

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
}

describe("xuất Excel", () => {
  it("tiêu đề in đậm, cố định hàng đầu, định dạng tiền / ngày, cột công thức đã tính", async () => {
    const wb = await load(await buildXlsx([recordsSheet(obj, rows)]));
    const ws = wb.getWorksheet("Đơn hàng")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Đơn", "Giai đoạn", "Phụ trách", "SĐT", "Số lượng", "Đơn giá", "Ngày giao", "Thành tiền", "Giá trị", "Ngày tạo"]);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    const r2 = ws.getRow(2);
    expect(r2.getCell(2).value).toBe("Thắng");
    expect(r2.getCell(4).value).toBe("0912345678");
    expect(r2.getCell(6).value).toBe(1500000);
    expect(ws.getColumn(6).numFmt).toContain("₫");
    expect((r2.getCell(7).value as Date).toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(ws.getColumn(7).numFmt).toBe("dd/mm/yyyy");
    expect(r2.getCell(8).value).toBe(3000000);
    expect(ws.getColumn(8).numFmt).toContain("₫");
    expect(ws.getRow(3).getCell(7).value).toBeNull();
    for (let c = 1; c <= 10; c++) expect(ws.getColumn(c).width).toBeGreaterThanOrEqual(10);
  });

  it("file mẫu có sheet dữ liệu + hướng dẫn, không có cột công thức", async () => {
    const wb = await load(await buildXlsx(templateSheets(obj)));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Đơn hàng", "Hướng dẫn"]);
    expect(wb.worksheets[0].getRow(1).values).not.toContain("Thành tiền");
    expect(wb.worksheets[0].rowCount).toBe(3);
  });

  it("tên sheet dài / ký tự cấm / trùng được sửa", async () => {
    const s = { columns: [{ header: "A", kind: "text" as const }], rows: [["x"]] };
    const wb = await load(await buildXlsx([{ name: "Bảng: a/b?*[c]", ...s }, { name: "Bảng: a/b?*[c]", ...s }, { name: "x".repeat(50), ...s }]));
    expect(wb.worksheets.map((w) => w.name.length <= 31)).toEqual([true, true, true]);
    expect(new Set(wb.worksheets.map((w) => w.name)).size).toBe(3);
  });
});

describe("đọc Excel", () => {
  it("đọc lại file xuất: ngày → yyyy-mm-dd, số giữ nguyên, bỏ dòng trống", async () => {
    const t = await readXlsx(await buildXlsx([recordsSheet(obj, rows)]));
    expect(t).toHaveLength(3);
    expect(t[1].slice(0, 7)).toEqual(["Đơn A", "Thắng", "Lan", "0912345678", "2", "1500000", "2026-03-15"]);
  });
  it("chữ định dạng, công thức, liên kết, số điện thoại dạng số", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("A");
    ws.addRow(["Tên", "SĐT", "Tổng", "Web"]);
    ws.addRow([{ richText: [{ text: "Nguyễn " }, { text: "Văn A", font: { bold: true } }] }, 912345678, { formula: "1+1", result: 2 }, { text: "trang", hyperlink: "https://a.vn" }]);
    ws.addRow([]);
    ws.addRow(["B", "", "", ""]);
    const t = await readXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(t).toEqual([
      ["Tên", "SĐT", "Tổng", "Web"],
      ["Nguyễn Văn A", "912345678", "2", "trang"],
      ["B", "", "", ""],
    ]);
  });
  it("toDate hiểu yyyy-mm-dd và dd/mm/yyyy", () => {
    expect(toDate("2026-01-31")?.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(toDate("5/1/2026")?.toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(toDate("không phải ngày")).toBeNull();
  });
});
