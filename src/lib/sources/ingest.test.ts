import { describe, expect, it, vi } from "vitest";

// ingest.ts kéo theo Prisma; chỉ kiểm thử hàm thuần nên thay db bằng đối tượng rỗng.
vi.mock("../db", () => ({ db: {}, parseJson: (s: string, f: unknown) => (s ? JSON.parse(s) : f) }));
vi.mock("../records", () => ({ createRecord: vi.fn() }));
vi.mock("../metrics", () => ({ wonLost: vi.fn() }));

const { normPhone, CHANNELS } = await import("./ingest");

describe("normPhone", () => {
  it.each([
    ["0912345678", "0912345678"],
    ["0912.345.678", "0912345678"],
    ["0912 345 678", "0912345678"],
    ["+84 912 345 678", "0912345678"],
    ["84912345678", "0912345678"],
    ["(+84) 91-234-5678", "0912345678"],
    ["912345678", "0912345678"],
    ["02838123456", "02838123456"],
  ])("%s → %s", (input, out) => expect(normPhone(input)).toBe(out));

  it("trả rỗng khi không phải số điện thoại", () => {
    expect(normPhone("")).toBe("");
    expect(normPhone(undefined)).toBe("");
    expect(normPhone("abc")).toBe("");
    expect(normPhone("12345")).toBe("");
    expect(normPhone("0912345678901234")).toBe("");
  });

  it("các cách viết khác nhau của cùng một số được coi là trùng", () => {
    const set = new Set(["0912345678", "+84912345678", "84 912 345 678", "912.345.678"].map(normPhone));
    expect(set.size).toBe(1);
  });
});

describe("CHANNELS", () => {
  it("có đủ kênh chính", () => {
    expect(Object.keys(CHANNELS)).toEqual(expect.arrayContaining(["ads", "zalo", "ecommerce", "website", "call"]));
  });
});
