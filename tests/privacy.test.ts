import { describe, expect, it } from "vitest";
import { dropMaskedEdits, exportRowsOf, maskEmail, maskPhone, maskRecord, quotaResult, startOfDayVN } from "@/lib/privacy";

const obj = { fields: [{ key: "sdt", type: "phone" }, { key: "mail", type: "email" }, { key: "ghi_chu", type: "text" }] };
const dto = { id: "1", data: { sdt: "0912345678", mail: "an@email.vn", ghi_chu: "gọi 0912345678", _sdt2: "0987654321" } };

describe("Che thông tin", () => {
  it("che số điện thoại", () => {
    expect(maskPhone("0912345678")).toBe("0912•••678");
    expect(maskPhone("0912 345 678")).toBe("0912•••678");
    expect(maskPhone("+84912345678")).toBe("+8491•••678");
    expect(maskPhone("12345")).toBe("12•••");
    expect(maskPhone("")).toBe("");
  });

  it("che email", () => {
    expect(maskEmail("an@email.vn")).toBe("a•@email.vn");
    expect(maskEmail("nguyenvan@x.vn")).toBe("n•••@x.vn");
    expect(maskEmail("khongphaiemail")).toBe("k•••");
  });

  it("chỉ che với nhân viên, theo kiểu trường và khoá kiểu _sdt", () => {
    const prefs = { maskPhone: true, maskEmail: true };
    expect(maskRecord(dto, obj, "owner", prefs)).toBe(dto);
    expect(maskRecord(dto, obj, "manager", prefs)).toBe(dto);
    const m = maskRecord(dto, obj, "member", prefs);
    expect(m.data).toEqual({ sdt: "0912•••678", mail: "a•@email.vn", ghi_chu: "gọi 0912345678", _sdt2: "0987•••321" });
    expect(dto.data.sdt).toBe("0912345678");
  });

  it("tắt che email thì giữ email", () => {
    const m = maskRecord(dto, obj, "member", { maskPhone: true, maskEmail: false });
    expect(m.data.mail).toBe("an@email.vn");
    expect(maskRecord(dto, obj, "member", { maskPhone: false, maskEmail: false })).toBe(dto);
  });

  it("bỏ giá trị đã che khi lưu", () => {
    expect(dropMaskedEdits({ sdt: "0912•••678", ten: "An", tuoi: 30 })).toEqual({ ten: "An", tuoi: 30 });
    expect(dropMaskedEdits(undefined)).toBeUndefined();
  });
});

describe("Hạn mức xuất", () => {
  it("đọc số dòng từ nhật ký", () => {
    expect(exportRowsOf({ summary: "Xuất 21 mục (Khách) ra XLSX", diffJson: "" })).toBe(21);
    expect(exportRowsOf({ summary: "Xuất 21 mục", diffJson: JSON.stringify({ rows: 40 }) })).toBe(40);
    expect(exportRowsOf({ summary: "khác", diffJson: "" })).toBe(0);
  });

  it("tính còn lại và chặn khi vượt", () => {
    expect(quotaResult(0, 100, 0)).toMatchObject({ ok: true, remaining: Infinity });
    expect(quotaResult(50, 30, 100)).toMatchObject({ ok: true, remaining: 20 });
    const r = quotaResult(80, 30, 100);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(20);
    expect(r.message).toContain("20 dòng");
    expect(quotaResult(100, 1, 100).message).toContain("đã xuất đủ");
  });

  it("đầu ngày theo giờ Việt Nam", () => {
    expect(startOfDayVN(new Date("2026-11-06T18:30:00Z")).toISOString()).toBe("2026-11-06T17:00:00.000Z");
    expect(startOfDayVN(new Date("2026-11-06T16:00:00Z")).toISOString()).toBe("2026-11-05T17:00:00.000Z");
  });
});
