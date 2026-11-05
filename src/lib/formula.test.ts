import { describe, expect, it } from "vitest";
import { compileFormula, evalField, evalFormula, formatFormulaValue, isMoneyFormula, validateFormula, type FormulaRecord } from "./formula";
import type { ObjectDef } from "./config/schema";

const obj: Pick<ObjectDef, "fields" | "statuses"> = {
  statuses: [
    { key: "moi", label: "Mới", color: "blue" },
    { key: "thang", label: "Thắng", color: "green" },
  ],
  fields: [
    { key: "so_luong", label: "Số lượng", type: "number", options: [] },
    { key: "don_gia", label: "Đơn giá", type: "money", options: [] },
    { key: "han", label: "Hạn", type: "date", options: [] },
    { key: "ghi_chu", label: "Ghi chú", type: "text", options: [] },
    { key: "thanh_tien", label: "Thành tiền", type: "formula", options: [], formula: "{so_luong} * {don_gia}" },
    { key: "vong", label: "Vòng", type: "formula", options: [], formula: "{vong} + 1" },
  ],
};

const rec: FormulaRecord = {
  title: "Chị Lan",
  status: "moi",
  ownerName: "Minh",
  amount: 5_000_000,
  score: 72,
  winProb: 60,
  createdAt: "2026-01-01T03:00:00.000Z",
  data: { so_luong: 3, don_gia: 200000, han: "2026-01-11", ghi_chu: "VIP" },
};

const run = (src: string) => evalFormula(src, rec, obj);
const val = (src: string) => {
  const r = run(src);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("formula: phép toán", () => {
  it("số học và thứ tự ưu tiên", () => {
    expect(val("1 + 2 * 3")).toBe(7);
    expect(val("(1 + 2) * 3")).toBe(9);
    expect(val("2 ^ 3 ^ 1")).toBe(8);
    expect(val("-2 + 5")).toBe(3);
    expect(val("50%")).toBe(0.5);
    expect(val("=10/4")).toBe(2.5);
  });
  it("chuỗi và nối &", () => {
    expect(val('"Xin chào " & {tieu_de}')).toBe("Xin chào Chị Lan");
    expect(val('"Nói ""ok"""')).toBe('Nói "ok"');
    expect(val('{ghi_chu} & "-" & {so_luong}')).toBe("VIP-3");
  });
  it("so sánh", () => {
    expect(val("{diem} >= 70")).toBe(true);
    expect(val("{diem} <> 72")).toBe(false);
    expect(val('{ghi_chu} = "vip"')).toBe(true);
    expect(val("1 < 2")).toBe(true);
  });
});

describe("formula: tham chiếu", () => {
  it("trường dữ liệu và trường dựng sẵn", () => {
    expect(val("{so_luong} * {don_gia}")).toBe(600000);
    expect(val("{gia_tri} * {kha_nang_chot} / 100")).toBe(3_000_000);
    expect(val("{trang_thai}")).toBe("Mới");
    expect(val("{phu_trach}")).toBe("Minh");
  });
  it("cột công thức tham chiếu cột công thức khác", () => {
    expect(val("{thanh_tien} + 1")).toBe(600001);
  });
  it("chặn vòng lặp", () => {
    const r = evalField(obj.fields[5], rec, obj);
    expect(r.ok).toBe(false);
  });
  it("trường không tồn tại báo lỗi", () => {
    expect(run("{khong_co} + 1").ok).toBe(false);
    expect(validateFormula("{khong_co}", obj)).toMatch(/Không có trường/);
  });
});

describe("formula: hàm formulajs", () => {
  it("SUM, ROUND, MAX, MIN, CONCAT", () => {
    expect(val("SUM(1, 2, {so_luong})")).toBe(6);
    expect(val("ROUND(10 / 3, 2)")).toBe(3.33);
    expect(val("MAX(1, {so_luong}, 2)")).toBe(3);
    expect(val("MIN(4; 9)")).toBe(4);
    expect(val('CONCAT("A", "B", 1)')).toBe("AB1");
  });
  it("IF, AND, OR đánh giá lười", () => {
    expect(val('IF({diem} > 50, "Nóng", "Lạnh")')).toBe("Nóng");
    expect(val('IF(FALSE, 1/0, "an toàn")')).toBe("an toàn");
    expect(val("AND({diem} > 50, {so_luong} = 3)")).toBe(true);
    expect(val("OR({diem} > 90, {so_luong} = 1)")).toBe(false);
    expect(val("IFERROR(1/0, -1)")).toBe(-1);
  });
  it("ngày: DAYS, phép trừ ngày, TODAY", () => {
    expect(val("DAYS({han}, {tao_luc})")).toBe(10);
    expect(val("{han} - {tao_luc}")).toBe(10);
    expect(typeof val("DAYS({han}, TODAY())")).toBe("number");
    expect(val("{han} + 1")).toBeInstanceOf(Date);
  });
});

describe("formula: lỗi và an toàn", () => {
  it("cú pháp sai", () => {
    expect(compileFormula("1 +").ok).toBe(false);
    expect(compileFormula("(1 + 2").ok).toBe(false);
    expect(compileFormula('"chưa đóng').ok).toBe(false);
    expect(compileFormula("").ok).toBe(false);
    expect(compileFormula("so_luong * 2").ok).toBe(false);
  });
  it("không chạy được mã JavaScript", () => {
    expect(compileFormula("constructor.constructor('return 1')()").ok).toBe(false);
    expect(compileFormula("HAMKHONGCO(1)").ok).toBe(false);
    expect(compileFormula("alert(1)").ok).toBe(false);
  });
  it("chia cho 0", () => {
    const r = run("1 / 0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Chia cho 0/);
  });
  it("chữ không phải số", () => {
    expect(run("{ghi_chu} * 2").ok).toBe(false);
  });
});

describe("formula: hiển thị", () => {
  it("nhận biết công thức tiền", () => {
    expect(isMoneyFormula({ formula: "{gia_tri} * 0.1" }, obj)).toBe(true);
    expect(isMoneyFormula({ formula: "{don_gia} * 2" }, obj)).toBe(true);
    expect(isMoneyFormula({ formula: "{thanh_tien}" }, obj)).toBe(true);
    expect(isMoneyFormula({ formula: "{so_luong} * 2" }, obj)).toBe(false);
  });
  it("định dạng kết quả", () => {
    expect(formatFormulaValue(true)).toBe("Đúng");
    expect(formatFormulaValue(1234.567)).toBe((1234.57).toLocaleString("vi-VN"));
    expect(formatFormulaValue(5e6, { money: true, vnd: (n) => `${n / 1e6} tr` })).toBe("5 tr");
  });
});
