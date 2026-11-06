import { describe, expect, it } from "vitest";
import { detectContact, hasPhone, normalizePhoneVN, plainSameLength } from "@/lib/chat/detect";

const phones = (t: string) => detectContact(t).phones;

describe("detectContact — số điện thoại", () => {
  it("nhận các đầu số di động 03/05/07/08/09", () => {
    expect(phones("sđt 0912345678")).toEqual(["0912345678"]);
    expect(phones("số em 0387654321 ạ")).toEqual(["0387654321"]);
    expect(phones("0567123456")).toEqual(["0567123456"]);
    expect(phones("lh 0701234567")).toEqual(["0701234567"]);
    expect(phones("0868 111 222")).toEqual(["0868111222"]);
  });

  it("nhận số viết có dấu cách, chấm, gạch", () => {
    expect(phones("0912 345 678")).toEqual(["0912345678"]);
    expect(phones("0912.345.678")).toEqual(["0912345678"]);
    expect(phones("0912-345-678")).toEqual(["0912345678"]);
    expect(phones("091 234 5678")).toEqual(["0912345678"]);
    expect(phones("0912 34 56 78")).toEqual(["0912345678"]);
    expect(phones("0912 - 345 - 678")).toEqual(["0912345678"]);
  });

  it("nhận dạng +84 / 84 / (+84) và chuẩn hoá về 0", () => {
    expect(phones("+84912345678")).toEqual(["0912345678"]);
    expect(phones("+84 912 345 678")).toEqual(["0912345678"]);
    expect(phones("84912345678")).toEqual(["0912345678"]);
    expect(phones("(+84) 912.345.678")).toEqual(["0912345678"]);
    expect(phones("+84 0912345678")).toEqual(["0912345678"]);
  });

  it("nhận số cố định 02x (11 số)", () => {
    expect(phones("tổng đài 024 3826 1234")).toEqual(["02438261234"]);
  });

  it("nhiều số trong một tin, bỏ trùng", () => {
    expect(phones("0912345678 hoặc 0987654321, gọi 0912.345.678 nhé")).toEqual(["0912345678", "0987654321"]);
  });

  it("số dính chữ / dính số khác thì không phải SĐT", () => {
    expect(phones("DH0912345678")).toEqual([]);
    expect(phones("09123456789012")).toEqual([]);
    expect(phones("#0912345678")).toEqual([]);
    expect(phones("abc0912345678")).toEqual([]);
  });

  it("bỏ qua mã đơn, số tài khoản, giấy tờ", () => {
    expect(phones("mã đơn 0912345678")).toEqual([]);
    expect(phones("Mã vận đơn: 0912345678")).toEqual([]);
    expect(phones("stk 0912345678 vietcombank")).toEqual([]);
    expect(phones("CCCD 0912345678")).toEqual([]);
  });

  it("bỏ qua giá tiền và ngày tháng", () => {
    expect(phones("giá 350.000đ")).toEqual([]);
    expect(phones("1.200.000 vnđ")).toEqual([]);
    expect(phones("combo 350.000.000đ")).toEqual([]);
    expect(phones("12/03/2024")).toEqual([]);
    expect(phones("ngày 2024-03-12 lúc 09:30")).toEqual([]);
    expect(phones("0912345678đ")).toEqual([]);
    expect(phones("tổng 0912345678k")).toEqual([]);
    expect(phones("sale 50% chỉ 299k")).toEqual([]);
  });

  it("đầu số không hợp lệ thì bỏ", () => {
    expect(phones("0112345678")).toEqual([]);
    expect(phones("0412345678")).toEqual([]);
    expect(phones("12345678")).toEqual([]);
  });

  it("không nhầm chữ số trong email", () => {
    const d = detectContact("mail lan0912345678@gmail.com nha");
    expect(d.phones).toEqual([]);
    expect(d.emails).toEqual(["lan0912345678@gmail.com"]);
  });

  it("hasPhone", () => {
    expect(hasPhone("ib e nha 0909 123 456")).toBe(true);
    expect(hasPhone("giá bao nhiêu vậy shop")).toBe(false);
  });
});

describe("detectContact — email", () => {
  it("tách email, viết thường", () => {
    expect(detectContact("Gửi báo giá vào Lan.Nguyen@Example.com giúp em").emails).toEqual(["lan.nguyen@example.com"]);
    expect(detectContact("không có email").emails).toEqual([]);
  });
});

describe("detectContact — địa chỉ", () => {
  const addr = (t: string) => detectContact(t).address;

  it("địa chỉ đầy đủ có dấu", () => {
    expect(addr("Ship về số 12 ngõ 34 Trần Duy Hưng, P. Trung Hoà, Q. Cầu Giấy, Hà Nội nhé shop")).toBe("số 12 ngõ 34 Trần Duy Hưng, P. Trung Hoà, Q. Cầu Giấy, Hà Nội");
  });

  it("có từ báo hiệu 'địa chỉ:'", () => {
    expect(addr("Địa chỉ: 45 Lê Lợi, phường Bến Nghé, quận 1, TP.HCM")).toBe("45 Lê Lợi, phường Bến Nghé, quận 1, TP.HCM");
  });

  it("không dấu", () => {
    expect(addr("giao den 88 duong Nguyen Trai, phuong 3, quan 5, ho chi minh")).toBe("88 duong Nguyen Trai, phuong 3, quan 5, ho chi minh");
  });

  it("viết tắt P.5 Q.3 và bỏ SĐT đi kèm", () => {
    const d = detectContact("Em tên Mai 0912345678, 120/5 Võ Văn Tần P.5 Q.3 TPHCM");
    expect(d.phones).toEqual(["0912345678"]);
    expect(d.address).toContain("120/5 Võ Văn Tần P.5 Q.3 TPHCM");
    expect(d.address).not.toContain("0912");
  });

  it("nông thôn: thôn/xã/huyện/tỉnh", () => {
    expect(addr("thôn Đông, xã Yên Phú, huyện Yên Mỹ, tỉnh Hưng Yên")).toBe("thôn Đông, xã Yên Phú, huyện Yên Mỹ, tỉnh Hưng Yên");
  });

  it("tin bình thường không có địa chỉ", () => {
    expect(addr("Giá bao nhiêu vậy shop?")).toBe("");
    expect(addr("Nhà em xa quá")).toBe("");
    expect(addr("Còn size M không ạ, em lấy 2 cái")).toBe("");
    expect(addr("Ok cảm ơn shop nhiều!")).toBe("");
    expect(addr("Hà Nội có chi nhánh không shop")).toBe("");
  });

  it("chuỗi rỗng", () => {
    expect(detectContact("")).toEqual({ phones: [], emails: [], address: "" });
  });
});

describe("tiện ích", () => {
  it("plainSameLength giữ độ dài", () => {
    const s = "Đường Trần Hưng Đạo 😀 phường";
    expect(plainSameLength(s).length).toBe(s.length);
    expect(plainSameLength("Đường")).toBe("duong");
  });
  it("normalizePhoneVN", () => {
    expect(normalizePhoneVN("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhoneVN("0912.345.678")).toBe("0912345678");
  });
});
