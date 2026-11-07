import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { isCommitted, isLow, moveQty, orderStockDelta, runningBalance, shortages, stockValue, StockVoucherInput } from "@/lib/stock/shared";
import { priceFor, stampLines, PriceRuleInput, type PriceRuleLite } from "@/lib/sales/pricing";
import { LinesSchema, moneyWords, parseLines, type Line } from "@/lib/sales/lines";
import { builtinLayout, fillVars, parseLayout, sampleData, BLOCKS, DOC_TYPES, opt, newBlock } from "@/lib/print/blocks";
import { quoteData, orderData, contractData, varsOf } from "@/lib/print/doc";
import { PrintDoc } from "@/lib/print/render";

// ---------------- Kho ----------------
describe("sổ kho", () => {
  it("số dư chạy cộng dồn, làm tròn 3 số lẻ", () => {
    expect(runningBalance(10, [5, -3, -2.5, 0.1, 0.2])).toEqual([15, 12, 9.5, 9.6, 9.8]);
    expect(runningBalance(0, [])).toEqual([]);
  });

  it("phát sinh theo loại phiếu", () => {
    expect(moveQty("in", 5, 2)).toBe(5);
    expect(moveQty("in", -5, 2)).toBe(5);
    expect(moveQty("out", 3, 10)).toBe(-3);
    expect(moveQty("adjust", 7, 10)).toBe(-3); // đếm được 7, sổ ghi 10
    expect(moveQty("adjust", 12, 10)).toBe(2);
    expect(moveQty("adjust", 10, 10)).toBe(0);
  });

  it("trạng thái giữ hàng", () => {
    expect(["new", "confirmed", "shipping", "done", "cancelled"].map(isCommitted)).toEqual([false, true, true, true, false]);
  });

  const tracked = new Set(["a", "b"]);
  const lines = [
    { productId: "a", qty: 2 },
    { productId: "a", qty: 1 },
    { productId: "b", qty: 4 },
    { productId: "x", qty: 9 }, // không theo dõi tồn
    { qty: 1 }, // dòng tự do
  ];

  it("đơn xác nhận: trừ đúng một lần (idempotent)", () => {
    const first = orderStockDelta(lines, [], true, tracked);
    expect(Object.fromEntries(first)).toEqual({ a: -3, b: -4 });
    // Đã ghi phiếu "order" tương ứng → gọi lại không ghi gì nữa.
    const moves = [...first].map(([productId, qty]) => ({ productId, qty, kind: "order" }));
    expect(orderStockDelta(lines, moves, true, tracked).size).toBe(0);
    expect(orderStockDelta(lines, moves, true, tracked).size).toBe(0);
  });

  it("huỷ hoàn kho đúng một lần; mở lại rồi xác nhận lần nữa trừ lại", () => {
    const out = [
      { productId: "a", qty: -3, kind: "order" },
      { productId: "b", qty: -4, kind: "order" },
    ];
    const back = orderStockDelta(lines, out, false, tracked);
    expect(Object.fromEntries(back)).toEqual({ a: 3, b: 4 });
    const afterReturn = [...out, ...[...back].map(([productId, qty]) => ({ productId, qty, kind: "return" }))];
    expect(orderStockDelta(lines, afterReturn, false, tracked).size).toBe(0);
    expect(Object.fromEntries(orderStockDelta(lines, afterReturn, true, tracked))).toEqual({ a: -3, b: -4 });
  });

  it("bỏ qua phiếu nhập/xuất tay của cùng sản phẩm khi tính phần của đơn", () => {
    const moves = [
      { productId: "a", qty: 100, kind: "in" },
      { productId: "a", qty: -3, kind: "order" },
    ];
    expect(Object.fromEntries(orderStockDelta(lines, moves, true, tracked))).toEqual({ b: -4 });
  });

  it("thiếu hàng, sắp hết, giá trị tồn", () => {
    const ps = [
      { id: "a", name: "A", stock: 2, trackStock: true },
      { id: "b", name: "B", stock: 10, trackStock: true },
      { id: "x", name: "X", stock: 0, trackStock: false },
    ];
    expect(shortages(lines, ps)).toEqual([{ productId: "a", name: "A", need: 3, stock: 2 }]);
    expect(isLow({ trackStock: true, stock: 3, lowStock: 5 })).toBe(true);
    expect(isLow({ trackStock: true, stock: 6, lowStock: 5 })).toBe(false);
    expect(isLow({ trackStock: true, stock: -1, lowStock: 0 })).toBe(true);
    expect(isLow({ trackStock: false, stock: 0, lowStock: 5 })).toBe(false);
    expect(stockValue({ stock: 3, price: 100_000 })).toBe(300_000);
    expect(stockValue({ stock: -2, price: 100_000 })).toBe(0);
  });

  it("kiểm tra phiếu kho", () => {
    expect(StockVoucherInput.safeParse({ kind: "in", lines: [] }).success).toBe(false);
    const p = StockVoucherInput.parse({ kind: "out", reason: "Hỏng", lines: [{ productId: "a", qty: "2" }] });
    expect(p.lines[0].qty).toBe(2);
  });
});

// ---------------- Giá theo hạng ----------------
describe("priceFor", () => {
  const R = (r: Partial<PriceRuleLite>): PriceRuleLite => ({ id: r.id ?? "r", tier: "Vàng", productId: "", category: "", discountPct: 0, price: null, ...r });
  const rules = [R({ id: "cat%", category: "Mỹ phẩm", discountPct: 10 }), R({ id: "catFix", category: "Thẻ", price: 4_500_000 }), R({ id: "p%", productId: "p1", discountPct: 15 }), R({ id: "all%", discountPct: 2 }), R({ id: "bac", tier: "Bạc", productId: "p1", price: 1 })];
  const base = { basePrice: 690_000, productId: "p1", category: "Mỹ phẩm", tier: "Vàng", rules };

  it("ưu tiên: SP giá cố định > SP % > nhóm cố định > nhóm % > mọi SP > không", () => {
    expect(priceFor({ ...base, rules: [...rules, R({ id: "pFix", productId: "p1", price: 500_000 })] })).toEqual({ price: 500_000, ruleId: "pFix", label: "Giá hạng Vàng" });
    expect(priceFor(base)).toEqual({ price: 586_500, ruleId: "p%", label: "Giá hạng Vàng −15%" });
    expect(priceFor({ ...base, productId: "p2", category: "Thẻ", basePrice: 5_000_000 }).ruleId).toBe("catFix");
    expect(priceFor({ ...base, productId: "p2", rules: [...rules, R({ id: "catFix2", category: "Mỹ phẩm", price: 600_000 })] }).ruleId).toBe("catFix2");
    expect(priceFor({ ...base, productId: "p2" })).toEqual({ price: 621_000, ruleId: "cat%", label: "Giá hạng Vàng −10%" });
    expect(priceFor({ ...base, productId: "p3", category: "Khác" }).ruleId).toBe("all%");
    expect(priceFor({ ...base, rules: rules.filter((r) => r.id === "bac") })).toEqual({ price: 690_000, ruleId: null, label: "" });
  });

  it("không có hạng / quy tắc tắt / % = 0 → giá niêm yết", () => {
    expect(priceFor({ ...base, tier: null }).ruleId).toBeNull();
    expect(priceFor({ ...base, rules: [R({ id: "off", productId: "p1", discountPct: 50, active: false })] }).ruleId).toBeNull();
    expect(priceFor({ ...base, rules: [R({ id: "z", productId: "p1", discountPct: 0 })] })).toEqual({ price: 690_000, ruleId: null, label: "" });
  });

  it("kẹp % và không âm, làm tròn đồng", () => {
    expect(priceFor({ ...base, rules: [R({ productId: "p1", discountPct: 150 })] }).price).toBe(0);
    expect(priceFor({ ...base, basePrice: 333, rules: [R({ productId: "p1", discountPct: 50 })] }).price).toBe(167);
    expect(priceFor({ ...base, rules: [R({ productId: "p1", price: -5 })] }).price).toBe(0);
    expect(priceFor({ ...base, rules: [R({ productId: "p1", discountPct: 7.5 })] }).label).toBe("Giá hạng Vàng −7,5%");
  });

  it("máy chủ đóng dấu: ruleId chỉ khi giá đúng giá hạng; client giả ruleId bị bỏ", () => {
    const L = (p: Partial<Line>): Line => ({ code: "", name: "Hàng", unit: "", qty: 1, price: 0, discountPct: 0, vatPct: 0, ...p });
    const prods = [{ id: "p1", price: 690_000, category: "Mỹ phẩm" }];
    const out = stampLines([L({ productId: "p1", price: 586_500 }), L({ productId: "p1", price: 1, priceRuleId: "p%" }), L({ name: "Tự do", price: 5, priceRuleId: "fake", listPrice: 9 })], prods, "Vàng", rules);
    expect(out[0]).toMatchObject({ priceRuleId: "p%", listPrice: 690_000, price: 586_500 });
    expect(out[1].priceRuleId).toBeUndefined();
    expect(out[1].price).toBe(1); // giữ giá gõ tay như trước
    expect(out[2].priceRuleId).toBeUndefined();
    expect(out[2].listPrice).toBeUndefined();
  });

  it("dòng hàng giữ listPrice/priceRuleId qua LinesSchema; dữ liệu cũ vẫn đọc được", () => {
    const p = LinesSchema.parse([{ name: "A", qty: 1, price: 1, listPrice: 2, priceRuleId: "r1" }, { name: "B", qty: 1, price: 1 }]);
    expect(p[0].priceRuleId).toBe("r1");
    expect(p[1].priceRuleId).toBeUndefined();
    expect(parseLines(JSON.stringify([{ name: "Cũ", qty: 1, price: 1, code: "", unit: "", discountPct: 0, vatPct: 0 }]))).toHaveLength(1);
  });

  it("kiểm tra quy tắc nhập", () => {
    expect(PriceRuleInput.safeParse({ tier: "Vàng", productId: "p1", category: "Mỹ phẩm", discountPct: 5 }).success).toBe(false);
    expect(PriceRuleInput.safeParse({ tier: "Vàng", productId: "p1" }).success).toBe(false);
    expect(PriceRuleInput.parse({ tier: "Vàng", category: "Mỹ phẩm", price: "" , discountPct: 5 }).price).toBeNull();
    expect(PriceRuleInput.parse({ tier: "Vàng", productId: "p1", price: 1000 }).price).toBe(1000);
  });
});

// ---------------- Mẫu in ----------------
describe("đọc số tiền bằng chữ", () => {
  it.each([
    [0, "Không đồng"],
    [5, "Năm đồng"],
    [15, "Mười lăm đồng"],
    [21, "Hai mươi mốt đồng"],
    [105, "Một trăm lẻ năm đồng"],
    [1_000_000, "Một triệu đồng"],
    [1_250_000, "Một triệu hai trăm năm mươi nghìn đồng"],
    [2_005_000, "Hai triệu không trăm lẻ năm nghìn đồng"],
    [1_000_000_000, "Một tỷ đồng"],
    [5_519_400, "Năm triệu năm trăm mười chín nghìn bốn trăm đồng"],
  ])("%d → %s", (n, s) => expect(moneyWords(n)).toBe(s));
});

describe("mẫu in", () => {
  it("biến chữ: thay biến biết, giữ biến lạ", () => {
    expect(fillVars("Kính gửi {ten_khach} – {so_chung_tu} {la}", { ten_khach: "Chị Hà", so_chung_tu: "BG-1" })).toBe("Kính gửi Chị Hà – BG-1 {la}");
  });

  it("layout hỏng → mẫu gốc; khối hỏng bị bỏ", () => {
    expect(parseLayout("not json", "quote")).toEqual(builtinLayout("quote"));
    expect(parseLayout("[]", "order")).toEqual(builtinLayout("order"));
    const l = parseLayout(JSON.stringify([{ id: "x", type: "note" }, { id: "y", type: "khong-co" }, { type: "text" }]), "quote");
    expect(l).toEqual([{ id: "x", type: "note" }]);
  });

  it("mỗi loại có mẫu gốc, mọi khối có nhãn, tuỳ chọn có mặc định", () => {
    for (const t of DOC_TYPES) expect(builtinLayout(t).length).toBeGreaterThan(5);
    const b = newBlock("items");
    expect(opt(b, "colQty")).toBe(true);
    expect(opt(b, "colCode")).toBe(false);
    expect(Object.values(BLOCKS).every((m) => m.label)).toBe(true);
  });

  const company = { name: "Spa Thử", address: "1 Lê Lợi", phone: "0909", email: "", taxCode: "123", bank: "VCB 0011", logoUrl: "", footer: "Cảm ơn quý khách" };

  it("mẫu gốc báo giá dựng như trang in cũ", () => {
    const html = renderToStaticMarkup(createElement(PrintDoc, { layout: builtinLayout("quote"), data: sampleData("quote"), company }));
    for (const s of ["Báo giá", "Spa Thử", "Kính gửi", "Hiệu lực đến", "Thành tiền", "Bằng chữ", "Thông tin chuyển khoản", "Đại diện khách hàng", "Đại diện Spa Thử", "Cảm ơn quý khách"]) expect(html).toContain(s);
    expect(html).toContain("<header");
    // Ẩn khối chữ ký cho trang công khai.
    expect(renderToStaticMarkup(createElement(PrintDoc, { layout: builtinLayout("quote"), data: sampleData("quote"), company, hide: ["signatures"] }))).not.toContain("Đại diện khách hàng");
  });

  it("tắt cột, ẩn khối, văn bản tự do có biến, ngăn trang", () => {
    const layout = [newBlock("items", { colVat: false, colCode: true }), newBlock("text", { text: "Tổng {tong_tien} cho {ten_khach}" }), newBlock("pagebreak"), { ...newBlock("note"), hidden: true }];
    const d = sampleData("order");
    const html = renderToStaticMarkup(createElement(PrintDoc, { layout, data: d, company }));
    expect(html).not.toContain(">VAT<");
    expect(html).toContain(">Mã<");
    expect(html).toContain(`cho ${d.customer.name}`);
    expect(html).toContain("pt-break");
    expect(html).not.toContain(d.note);
  });

  it("dữ liệu từ chứng từ", () => {
    const q = quoteData({ number: "BG-1", title: "T", customerName: "A", customerPhone: "1", customerEmail: "", createdAt: new Date("2026-01-02"), validUntil: null, itemsJson: "[]", subtotal: 0, discount: 0, vatTotal: 0, total: 1_000_000, note: "", terms: "", createdBy: "Lan", orderId: "o1" });
    expect(q.orderId).toBe("o1");
    expect(varsOf(q, { name: "X" }).tong_tien_chu).toBe("Một triệu đồng");
    const o = orderData({ id: "o2", number: "DH-1", customerName: "B", customerPhone: "2", createdAt: null, itemsJson: "[]", subtotal: 0, discount: 0, vatTotal: 0, total: 100, paid: 40, note: "", createdBy: "", shipAddress: "12 A", shipProvince: "HN" });
    expect(o.customer.address).toBe("12 A, HN");
    expect(varsOf(o, { name: "" }).con_no).toContain("60");
    const c = contractData({ number: "HD-1", title: "HĐ", customerName: "C", value: 2_000_000, signedAt: null, startAt: null, endAt: null, note: "", createdBy: "", createdAt: new Date() });
    expect(varsOf(c, { name: "" }).gia_tri_chu).toBe("Hai triệu đồng");
  });
});
