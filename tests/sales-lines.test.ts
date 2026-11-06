import { describe, expect, it } from "vitest";
import { LinesSchema, lineNet, moneyWords, parseLines, totals, type Line } from "@/lib/sales/lines";
import { quoteExpired, remaining, overdue } from "@/lib/sales/shared";

const L = (p: Partial<Line>): Line => ({ code: "", name: "Hàng", unit: "cái", qty: 1, price: 0, discountPct: 0, vatPct: 0, ...p });

describe("lineNet", () => {
  it("nhân số lượng, trừ chiết khấu dòng, làm tròn đồng", () => {
    expect(lineNet(L({ qty: 3, price: 100_000 }))).toBe(300_000);
    expect(lineNet(L({ qty: 3, price: 100_000, discountPct: 10 }))).toBe(270_000);
    expect(lineNet(L({ qty: 1, price: 333, discountPct: 50 }))).toBe(166); // 333 - round(166.5)=167
    expect(lineNet(L({ qty: 1.5, price: 1001 }))).toBe(1502);
  });
});

describe("totals", () => {
  it("không chiết khấu, VAT theo từng dòng", () => {
    const t = totals([L({ qty: 2, price: 500_000, vatPct: 10 }), L({ qty: 1, price: 200_000, vatPct: 8 })]);
    expect(t).toEqual({ subtotal: 1_200_000, vatTotal: 100_000 + 16_000, discount: 0, total: 1_316_000 });
  });

  it("chiết khấu đơn trừ trước thuế, chia theo tỷ lệ dòng", () => {
    // 1.000.000 (VAT 10%) + 1.000.000 (VAT 0%), giảm 200.000 → mỗi dòng giảm 100.000
    const t = totals([L({ price: 1_000_000, vatPct: 10 }), L({ price: 1_000_000, vatPct: 0 })], 200_000);
    expect(t.subtotal).toBe(2_000_000);
    expect(t.discount).toBe(200_000);
    expect(t.vatTotal).toBe(90_000);
    expect(t.total).toBe(1_890_000);
  });

  it("kẹp chiết khấu trong [0, subtotal]", () => {
    expect(totals([L({ price: 100_000, vatPct: 10 })], 500_000)).toEqual({ subtotal: 100_000, vatTotal: 0, discount: 100_000, total: 0 });
    expect(totals([L({ price: 100_000 })], -50).discount).toBe(0);
  });

  it("đơn rỗng bằng 0", () => {
    expect(totals([], 10_000)).toEqual({ subtotal: 0, vatTotal: 0, discount: 0, total: 0 });
  });

  it("luôn ra số nguyên đồng", () => {
    const t = totals([L({ qty: 3, price: 33_333, discountPct: 7, vatPct: 8 }), L({ qty: 7, price: 12_345, vatPct: 10 })], 12_345.6);
    for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true);
    expect(t.total).toBe(t.subtotal - t.discount + t.vatTotal);
  });
});

describe("LinesSchema / parseLines", () => {
  it("ép kiểu số từ chuỗi và chặn phần trăm ngoài khoảng", () => {
    const p = LinesSchema.parse([{ name: "Gói A", code: "A", unit: "gói", qty: "2", price: "150000", discountPct: 120, vatPct: "8" }]);
    expect(p[0]).toMatchObject({ qty: 2, price: 150_000, discountPct: 0, vatPct: 8 });
  });
  it("báo lỗi khi thiếu tên hoặc số âm", () => {
    expect(LinesSchema.safeParse([{ name: "", qty: 1, price: 1 }]).success).toBe(false);
    expect(LinesSchema.safeParse([{ name: "X", qty: -1, price: 1 }]).success).toBe(false);
  });
  it("bỏ dòng hỏng khi đọc JSON cũ", () => {
    expect(parseLines('[{"name":"Ok","qty":1,"price":5},{"qty":"x"}]')).toHaveLength(1);
    expect(parseLines("không phải json")).toEqual([]);
  });
});

describe("moneyWords", () => {
  it("đọc số tiền tiếng Việt", () => {
    expect(moneyWords(0)).toBe("Không đồng");
    expect(moneyWords(1_250_000)).toBe("Một triệu hai trăm năm mươi nghìn đồng");
    expect(moneyWords(105)).toBe("Một trăm lẻ năm đồng");
    expect(moneyWords(21_000)).toBe("Hai mươi mốt nghìn đồng");
    expect(moneyWords(1_005_000)).toBe("Một triệu không trăm lẻ năm nghìn đồng");
    expect(moneyWords(15)).toBe("Mười lăm đồng");
    expect(moneyWords(2_000_000_000)).toBe("Hai tỷ đồng");
  });
});

describe("trạng thái", () => {
  it("báo giá quá hạn chỉ khi còn mở", () => {
    const past = new Date(Date.now() - 3 * 864e5);
    expect(quoteExpired({ status: "sent", validUntil: past })).toBe(true);
    expect(quoteExpired({ status: "accepted", validUntil: past })).toBe(false);
    expect(quoteExpired({ status: "sent", validUntil: new Date() })).toBe(false);
  });
  it("công nợ", () => {
    expect(remaining({ total: 100, paid: 30 })).toBe(70);
    expect(remaining({ total: 100, paid: 30, status: "cancelled" })).toBe(0);
    expect(overdue({ total: 100, paid: 30, dueAt: new Date(Date.now() - 1000) })).toBe(true);
    expect(overdue({ total: 100, paid: 100, dueAt: new Date(Date.now() - 1000) })).toBe(false);
  });
});
