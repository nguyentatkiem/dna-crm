import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, checkVoucher, computeDiscount, effectiveStatus, fillVoucherTemplate, generateCode, normCode, uniqueCode, valueText } from "./shared";

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("mã voucher", () => {
  it("tiền tố + 6 ký tự không dễ nhầm", () => {
    const c = generateCode("sn-", Math.random);
    expect(c).toMatch(/^SN[A-Z0-9]{6}$/);
    for (let i = 0; i < 200; i++) expect(generateCode("X").slice(1)).not.toMatch(/[01OILSZB258]/);
    expect(generateCode("A", seq([0]))).toBe("A" + CODE_ALPHABET[0].repeat(6));
  });
  it("tránh mã đã có", () => {
    const taken = new Set(["DNA" + "A".repeat(6)]);
    const c = uniqueCode("DNA", (x) => taken.has(x), seq([0, 0, 0, 0, 0, 0, 0.5]));
    expect(taken.has(c)).toBe(false);
  });
  it("chuẩn hoá mã khách gõ", () => expect(normCode(" sn-ab cd ")).toBe("SNABCD"));
});

describe("computeDiscount", () => {
  const pct = { kind: "percent", value: 10, maxDiscount: 0, minOrder: 0 };
  it("theo phần trăm, có trần", () => {
    expect(computeDiscount(pct, 1_000_000)).toBe(100_000);
    expect(computeDiscount({ ...pct, maxDiscount: 50_000 }, 1_000_000)).toBe(50_000);
    expect(computeDiscount(pct, 12_345)).toBe(1_235);
  });
  it("số tiền cố định, không vượt tạm tính", () => {
    const amt = { kind: "amount", value: 50_000, maxDiscount: 0, minOrder: 0 };
    expect(computeDiscount(amt, 200_000)).toBe(50_000);
    expect(computeDiscount(amt, 30_000)).toBe(30_000);
  });
  it("chưa đủ giá trị tối thiểu", () => {
    expect(computeDiscount({ ...pct, minOrder: 500_000 }, 499_999)).toBe(0);
    expect(computeDiscount({ ...pct, minOrder: 500_000 }, 500_000)).toBe(50_000);
    expect(computeDiscount(pct, 0)).toBe(0);
  });
  it("mô tả giá trị", () => {
    expect(valueText({ kind: "amount", value: 50000, maxDiscount: 0, minOrder: 0 })).toBe("Giảm 50.000đ");
    expect(valueText({ ...pct, maxDiscount: 200000 })).toBe("Giảm 10% (tối đa 200.000đ)");
  });
});

describe("checkVoucher", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  const campaign = { kind: "percent", value: 10, maxDiscount: 0, minOrder: 100_000, active: true };
  const voucher = { status: "issued", expiresAt: new Date("2026-12-01"), recordId: "c1", usedOrderId: null };
  it("hợp lệ", () => expect(checkVoucher({ voucher, campaign, subtotal: 500_000, contactId: "c1", now })).toEqual({ discount: 50_000 }));
  it("các lỗi", () => {
    expect(checkVoucher({ voucher: null, campaign, subtotal: 1, now })).toEqual({ error: "Mã giảm giá không tồn tại" });
    expect(checkVoucher({ voucher: { ...voucher, status: "used" }, campaign, subtotal: 500_000, contactId: "c1", now })).toEqual({ error: "Mã này đã được sử dụng" });
    expect(checkVoucher({ voucher: { ...voucher, expiresAt: new Date("2026-11-01") }, campaign, subtotal: 500_000, contactId: "c1", now })).toEqual({ error: "Mã đã hết hạn" });
    expect(checkVoucher({ voucher, campaign, subtotal: 500_000, contactId: "c2", now })).toEqual({ error: "Mã này được phát cho khách khác" });
    expect("error" in checkVoucher({ voucher, campaign, subtotal: 50_000, contactId: "c1", now })).toBe(true);
    expect("error" in checkVoucher({ voucher, campaign: { ...campaign, active: false }, subtotal: 500_000, contactId: "c1", now })).toBe(true);
  });
  it("đơn đang sửa vẫn giữ được mã của chính nó", () => {
    expect(checkVoucher({ voucher: { ...voucher, status: "used", usedOrderId: "o1" }, campaign, subtotal: 500_000, contactId: "c1", orderId: "o1", now })).toEqual({ discount: 50_000 });
  });
  it("trạng thái thực tế", () => {
    expect(effectiveStatus({ status: "issued", expiresAt: "2026-11-01" }, now)).toBe("expired");
    expect(effectiveStatus({ status: "used", expiresAt: "2026-11-01" }, now)).toBe("used");
  });
});

it("điền mẫu tin", () => {
  expect(fillVoucherTemplate("Chào {name}, mã {code} {value} đến {expiresAt} {x}", { code: "SNAAA", value: "Giảm 10%", expiresAt: new Date(2026, 11, 5), name: "Lan" })).toBe("Chào Lan, mã SNAAA Giảm 10% đến 05/12/2026 {x}");
});

it("phần trăm lẻ hiện theo kiểu Việt", () => {
  expect(valueText({ kind: "percent", value: 12.5, maxDiscount: 0, minOrder: 0 })).toBe("Giảm 12,5%");
});
