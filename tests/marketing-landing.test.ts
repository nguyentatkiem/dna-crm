import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, dbRaw: {}, parseJson: (s: string, f: unknown) => (s ? JSON.parse(s) : f) }));
vi.mock("@/lib/records", () => ({ createRecord: vi.fn() }));

const { isBot, rateLimit, fallbackGen } = await import("@/lib/marketing/landing");
const { sanitizeBlocks, slugify, slugError, formBlock } = await import("@/app/lp/model");

describe("khối landing page", () => {
  it("bỏ khối sai, thêm id, chặn link javascript:", () => {
    const b = sanitizeBlocks([{ type: "hero", title: "A", href: "javascript:alert(1)", image: "data:x" }, { type: "khong-co" }, null, { type: "form" }]);
    expect(b).toHaveLength(2);
    expect(b[0].id).toBeTruthy();
    expect(b[0].type === "hero" && b[0].href).toBe("#dang-ky");
    expect(b[0].type === "hero" && b[0].image).toBe("");
    expect(formBlock(b)?.fields).toEqual({ phone: true, email: false, note: true });
  });

  it("slug không dấu và kiểm tra hợp lệ", () => {
    expect(slugify("Ưu đãi Tháng 11 – Đặc biệt!")).toBe("uu-dai-thang-11-dac-biet");
    expect(slugError("uu-dai")).toBeNull();
    expect(slugError("Uu dai")).not.toBeNull();
    expect(slugError("-ab")).not.toBeNull();
    expect(slugError("a--b")).not.toBeNull();
  });

  it("dựng trang theo luật từ DNA khi không có AI", () => {
    const g = fallbackGen({ businessName: "Hương Spa", products: "Chăm sóc da, triệt lông", targetCustomer: "Nữ 25–45 tuổi, văn phòng", hasAppointments: true }, { businessName: "Hương Spa", industry: "spa" });
    expect(g.hero.title).toContain("Chăm sóc da");
    expect(g.hero.button).toBe("Đặt lịch tư vấn");
    expect(g.benefits.length).toBeGreaterThanOrEqual(3);
  });
});

describe("chống spam", () => {
  it("nhận ra bot qua user-agent", () => {
    expect(isBot("")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
  });

  it("giới hạn số lần gửi theo IP trong cửa sổ thời gian", () => {
    const k = `ip-${Math.random()}`;
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit(k, 5, 60_000, t + i)).toBe(true);
    expect(rateLimit(k, 5, 60_000, t + 10)).toBe(false);
    expect(rateLimit(k, 5, 60_000, t + 61_000)).toBe(true);
  });
});
