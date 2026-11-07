import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newRecoveryCodes, openSecret, otpauthUri, sealSecret, totp, verifyTotp } from "@/lib/security/totp";
import { qrMatrix, qrSvg } from "@/lib/security/qr";
import { signingKey, signV4, uriEncode } from "@/lib/backup-remote";
import { scrubMessage, fingerprintOf } from "@/lib/errors";
import { deviceOf } from "@/lib/security/device";

describe("base32 (RFC 4648)", () => {
  it("mã hoá đúng vector chuẩn", () => {
    const v: [string, string][] = [["", ""], ["f", "MY======"], ["fo", "MZXQ===="], ["foo", "MZXW6==="], ["foob", "MZXW6YQ="], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI======"]];
    for (const [plain, enc] of v) {
      expect(base32Encode(Buffer.from(plain))).toBe(enc);
      expect(base32Decode(enc).toString()).toBe(plain);
    }
  });
});

describe("HOTP (RFC 4226 phụ lục D)", () => {
  it("10 giá trị đầu", () => {
    const key = Buffer.from("12345678901234567890");
    const exp = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    exp.forEach((e, i) => expect(hotp(key, i)).toBe(e));
  });
});

describe("TOTP (RFC 6238 phụ lục B, SHA1, 8 số)", () => {
  const key = Buffer.from("12345678901234567890");
  const v: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
  it.each(v)("t=%s", (t, code) => expect(totp(key, t * 1000, 8)).toBe(code));

  it("verifyTotp nhận mã hiện tại và lệch 1 bước, từ chối mã cũ", () => {
    const secret = base32Encode(key, false);
    const now = 1111111111000;
    expect(verifyTotp(secret, totp(key, now), now)).toBe(true);
    expect(verifyTotp(secret, totp(key, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totp(key, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "abc", now)).toBe(false);
  });

  it("mã hoá bí mật và mã khôi phục", () => {
    const s = sealSecret("JBSWY3DPEHPK3PXP");
    expect(s).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(s)).toBe("JBSWY3DPEHPK3PXP");
    expect(openSecret(s.slice(0, -2) + "xx")).toBeNull();
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
    expect(otpauthUri("ABC", "a@b.vn")).toBe("otpauth://totp/DNA%20CRM%3Aa%40b.vn?secret=ABC&issuer=DNA%20CRM&algorithm=SHA1&digits=6&period=30");
  });
});

describe("AWS Signature V4", () => {
  it("khoá ký theo ví dụ tài liệu AWS", () => {
    expect(signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam").toString("hex")).toBe("f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
  });

  it("bộ kiểm thử aws-sig-v4: get-vanilla", () => {
    const r = signV4({
      method: "GET",
      url: "https://example.amazonaws.com/",
      headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" },
      region: "us-east-1",
      service: "service",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      amzDate: "20150830T123600Z",
    });
    expect(r.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  });

  it("ví dụ IAM ListUsers trong tài liệu AWS", () => {
    const r = signV4({
      method: "GET",
      url: "https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08",
      headers: { host: "iam.amazonaws.com", "content-type": "application/x-www-form-urlencoded; charset=utf-8", "x-amz-date": "20150830T123600Z" },
      region: "us-east-1",
      service: "iam",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      amzDate: "20150830T123600Z",
    });
    expect(r.signature).toBe("5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7");
  });

  it("ví dụ S3 GET Object (có Range) trong tài liệu S3", () => {
    const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const r = signV4({
      method: "GET",
      url: "https://examplebucket.s3.amazonaws.com/test.txt",
      headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": empty, "x-amz-date": "20130524T000000Z" },
      payloadHash: empty,
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      amzDate: "20130524T000000Z",
    });
    expect(r.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  });

  it("mã hoá URI theo quy tắc AWS", () => {
    expect(uriEncode("a b/c~d*é")).toBe("a%20b%2Fc~d%2A%C3%A9");
    expect(uriEncode("a/b", true)).toBe("a/b");
  });
});

describe("Mã QR", () => {
  it("chọn phiên bản theo độ dài và có đủ mẫu định vị", () => {
    expect(qrMatrix("HELLO").length).toBe(21);
    const uri = otpauthUri("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "nguoidung.rat.dai@doanhnghiep.vn");
    const m = qrMatrix(uri);
    expect(m.length).toBeGreaterThanOrEqual(33);
    // Góc trên trái: viền đen 7 ô, vòng trắng, lõi 3x3 đen.
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(m[1][1]).toBe(false);
    expect(m[3][3]).toBe(true);
    // Ô tối bắt buộc cạnh mẫu định vị dưới trái.
    expect(m[m.length - 8][8]).toBe(true);
    expect(qrSvg("x")).toMatch(/^<svg/);
  });
});

describe("Nhật ký lỗi", () => {
  it("che email, số điện thoại, token", () => {
    const s = scrubMessage("Lỗi gửi tới khach@vi.du 0912345678 +84912345678 token=EAAGm0PX4ZCpsBAKZB1234567890abcdef Bearer abc.def.ghi");
    expect(s).not.toContain("khach@vi.du");
    expect(s).not.toContain("0912345678");
    expect(s).not.toContain("EAAGm0PX4ZCpsBA");
    expect(s).not.toContain("abc.def.ghi");
  });
  it("dấu vân tay ổn định, bỏ qua số thay đổi", () => {
    const a = fingerprintOf("Không tìm thấy đơn 123", "at x (a.ts:1:2)", "/api/orders");
    const b = fingerprintOf("Không tìm thấy đơn 456", "at x (a.ts:1:2)", "/api/orders");
    const c = fingerprintOf("Không tìm thấy đơn 456", "at x (a.ts:1:2)", "/api/quotes");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("nhận diện thiết bị", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari trên iPhone");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")).toBe("Chrome trên Windows");
    expect(deviceOf("")).toBe("Thiết bị không rõ");
  });
});

import { needs2fa, rateHit, rateOk } from "@/lib/security/sessions";
import { LEGACY_CUTOFF, legacyOk } from "@/lib/auth";

describe("Phiên đăng nhập & chính sách", () => {
  it("bắt buộc 2 lớp theo vai trò", () => {
    const owner = { isOwner: true, base: "owner" };
    const mgr = { isOwner: false, base: "manager" };
    const mem = { isOwner: false, base: "member" };
    expect([owner, mgr, mem].map((a) => needs2fa({ require2faFor: "none" }, a))).toEqual([false, false, false]);
    expect([owner, mgr, mem].map((a) => needs2fa({ require2faFor: "owners" }, a))).toEqual([true, false, false]);
    expect([owner, mgr, mem].map((a) => needs2fa({ require2faFor: "managers" }, a))).toEqual([true, true, false]);
  });
  it("giới hạn số lần sai theo IP", () => {
    const k = `ip:test-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateHit(k, 1000);
    expect(rateOk(k, 1000, 3)).toBe(false);
    expect(rateOk(k, 1000 + 16 * 60_000, 3)).toBe(true);
  });
  it("phiên cũ không sid chỉ dùng được 24 giờ sau mốc", () => {
    expect(legacyOk(LEGACY_CUTOFF - 100, LEGACY_CUTOFF + 3600)).toBe(true);
    expect(legacyOk(LEGACY_CUTOFF - 100, LEGACY_CUTOFF + 25 * 3600)).toBe(false);
    expect(legacyOk(LEGACY_CUTOFF + 10, LEGACY_CUTOFF + 20)).toBe(false);
    expect(legacyOk(undefined)).toBe(false);
  });
});
