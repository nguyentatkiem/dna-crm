import { describe, expect, it } from "vitest";
import { addEccAndInterleave, alignmentPositions, dataCodewordsM, encodeQr, formatBits, pickVersion, rsDivisor, rsRemainder, versionBits } from "@/lib/pay/qr";
import { buildVietQR, cleanAddInfo, crc16, findPayCode, parseTlv, payCodeCandidates, payCodeFor, verifyCrc } from "@/lib/pay/vietqr";
import { BANKS } from "@/lib/pay/banks";

describe("CRC16-CCITT-FALSE", () => {
  it("khớp vector chuẩn", () => {
    expect(crc16("123456789")).toBe("29B1");
    expect(crc16("")).toBe("FFFF");
  });
});

describe("buildVietQR", () => {
  const p = buildVietQR({ bin: "970436", accountNo: "0071000123456", accountName: "CONG TY A", amount: 1250000, addInfo: "DH20260004" });
  it("đúng cấu trúc EMVCo/NAPAS", () => {
    const t = parseTlv(p);
    expect(t["00"]).toBe("01");
    expect(t["01"]).toBe("12");
    expect(t["53"]).toBe("704");
    expect(t["54"]).toBe("1250000");
    expect(t["58"]).toBe("VN");
    const m = parseTlv(t["38"]);
    expect(m["00"]).toBe("A000000727");
    expect(m["02"]).toBe("QRIBFTTA");
    expect(parseTlv(m["01"])).toEqual({ "00": "970436", "01": "0071000123456" });
    expect(parseTlv(t["62"])["08"]).toBe("DH20260004");
    expect(p.startsWith("000201010212")).toBe(true);
    expect(verifyCrc(p)).toBe(true);
  });
  it("QR tĩnh khi không có số tiền, bỏ dấu nội dung", () => {
    const s = buildVietQR({ bin: "970422", accountNo: "123", addInfo: "Thanh toán đơn #12 – Đạt" });
    const t = parseTlv(s);
    expect(t["01"]).toBe("11");
    expect(t["54"]).toBeUndefined();
    expect(parseTlv(t["62"])["08"]).toBe("Thanh toan don 12 Dat");
    expect(verifyCrc(s)).toBe(true);
    expect(verifyCrc(s.slice(0, -1) + (s.endsWith("0") ? "1" : "0"))).toBe(false);
  });
  it("từ chối BIN sai", () => {
    expect(() => buildVietQR({ bin: "97", accountNo: "1" })).toThrow();
  });
  it("cleanAddInfo cắt độ dài", () => expect(cleanAddInfo("a".repeat(80)).length).toBe(50));
});

describe("payCode", () => {
  it("payCodeFor ghép tiền tố + chữ số", () => {
    expect(payCodeFor({ number: "DH-2026-0004" })).toBe("DH20260004");
    expect(payCodeFor({ number: "DH-2026-0004" }, "tt")).toBe("TT20260004");
    expect(payCodeFor({ number: "DH-2026-0004", payCode: "X1" })).toBe("X1");
  });
  const known = new Set(["DH20260004", "DH20260041", "DH202610000"]);
  const find = (c: string) => findPayCode(c, "DH", (x) => known.has(x));
  it.each([
    ["DH20260004", "DH20260004"],
    ["dh20260004", "DH20260004"],
    ["DH 2026 0004", "DH20260004"],
    ["dh-2026-0004 chuyen tien", "DH20260004"],
    ["MBVCB.3278614.DH20260004.CT tu 0123 NGUYEN VAN A", "DH20260004"],
    ["IBFT Thanh toán DH20260004 FT2631234", "DH20260004"],
    ["DH20260004 0912345678", "DH20260004"],
    ["NGUYEN VAN A CHUYEN KHOAN DH20260041", "DH20260041"],
    ["TT DH202610000", "DH202610000"],
    ["Đơn hàng DH20260004", "DH20260004"],
  ])("%s → %s", (content, code) => expect(find(content)).toBe(code));
  it.each(["DH2026000", "chuyen tien an trua", "DH20260005", "DH202600040"])("không khớp: %s", (c) => expect(find(c)).toBeNull());
  it("liệt kê điểm cắt", () => expect(payCodeCandidates("DH 2026 0004 0912345678")).toEqual(["DH2026", "DH20260004", "DH202600040912345678"]));
});

describe("QR encoder", () => {
  it("Reed–Solomon khớp ví dụ HELLO WORLD 1-M", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
  it("bit định dạng mức M đúng bảng chuẩn", () => {
    const table = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
    table.forEach((bits, mask) => expect(formatBits(mask).toString(2).padStart(15, "0")).toBe(bits));
  });
  it("bit phiên bản 7 đúng chuẩn", () => expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100"));
  it("vị trí mẫu căn chỉnh", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(10)).toEqual([6, 28, 50]);
  });
  it("dung lượng byte mức M", () => {
    expect([1, 2, 5, 10].map(dataCodewordsM)).toEqual([16, 28, 86, 216]);
    expect(pickVersion(14)).toBe(1);
    expect(pickVersion(15)).toBe(2);
    expect(pickVersion(213)).toBe(10);
  });
  it("đan xen đủ số mã", () => {
    const v = 5;
    const out = addEccAndInterleave(new Array(dataCodewordsM(v)).fill(0), v);
    expect(out.length).toBe(134);
  });
  it("ma trận có mẫu định vị, đường timing, module tối cố định", () => {
    const payload = buildVietQR({ bin: "970436", accountNo: "0071000123456", amount: 1250000, addInfo: "DH20260004" });
    const q = encodeQr(payload);
    expect(q.size).toBe(q.version * 4 + 17);
    const m = q.modules;
    const finderOk = (x0: number, y0: number) => {
      for (let dy = 0; dy < 7; dy++)
        for (let dx = 0; dx < 7; dx++) {
          const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          if (m[y0 + dy][x0 + dx] !== (d !== 2)) return false;
        }
      return true;
    };
    expect(finderOk(0, 0)).toBe(true);
    expect(finderOk(q.size - 7, 0)).toBe(true);
    expect(finderOk(0, q.size - 7)).toBe(true);
    for (let i = 8; i < q.size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[q.size - 8][8]).toBe(true);
    // Bit định dạng đọc lại được ở bản sao thứ nhất (hàng 8, cột 0..5 → bit 14..9).
    const fb = formatBits(q.mask);
    for (let i = 9; i < 15; i++) expect(m[8][14 - i]).toBe(((fb >>> i) & 1) === 1);
  });
  it("chọn mặt nạ ổn định (xác định)", () => {
    const a = encodeQr("DNA CRM");
    const b = encodeQr("DNA CRM");
    expect(a.mask).toBe(b.mask);
    expect(a.modules).toEqual(b.modules);
  });
});

describe("danh sách ngân hàng", () => {
  it("BIN 6 số, không trùng", () => {
    const bins = BANKS.map((b) => b.bin);
    expect(bins.every((b) => /^\d{6}$/.test(b))).toBe(true);
    expect(new Set(bins).size).toBe(bins.length);
    expect(BANKS.find((b) => b.code === "VCB")?.bin).toBe("970436");
  });
});
