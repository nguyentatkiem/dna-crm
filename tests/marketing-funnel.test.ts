import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {}, dbRaw: {}, parseJson: (s: string, f: unknown) => (s ? JSON.parse(s) : f) }));
vi.mock("@/lib/records", () => ({ createRecord: vi.fn() }));

const { computeFunnel, isContactActivity, stagesOf, parseRange } = await import("@/lib/marketing/funnel");

const d = (s: string) => new Date(`${s}T10:00:00`);
const contact = (id: string, created: string, channel: string, contacted = false, source = "Facebook") => ({ id, createdAt: d(created), channel, source, contacted });

describe("phân loại hoạt động", () => {
  const members = new Set(["Thảo"]);
  it.each([
    [{ kind: "call", author: "x", body: "" }, true],
    [{ kind: "message", author: "Marketing", body: "Đã gửi SMS\nChào" }, true],
    [{ kind: "message", author: "Marketing", body: "Bỏ qua tin SMS: Chưa cấu hình SMS" }, false],
    [{ kind: "message", author: "Marketing", body: "Chạy thử Email (không gửi thật)" }, false],
    [{ kind: "update", author: "Thảo", body: "Đã tư vấn" }, true],
    [{ kind: "update", author: "Facebook", body: "Nhu cầu" }, false],
    [{ kind: "system", author: "Thảo", body: "tạo" }, false],
  ])("%o → %s", (a, want) => expect(isContactActivity(a, members)).toBe(want));
});

describe("phễu", () => {
  const contacts = [
    contact("a", "2026-06-05", "ads", true),
    contact("b", "2026-06-20", "ads", true),
    contact("c", "2026-06-25", "ads", false),
    contact("d", "2026-07-02", "zalo", false, "Zalo OA"),
    contact("e", "2026-07-10", "zalo", true, "Zalo OA"),
  ];
  const deals = [
    { contactId: "a", won: true, at: d("2026-06-10") },
    { contactId: "a", won: true, at: d("2026-08-01") },
    { contactId: "b", won: true, at: d("2026-08-15") },
    { contactId: "d", won: false, at: d("2026-07-05") }, // có giao dịch dù chưa ghi nhận liên hệ
    { contactId: null, won: true, at: d("2026-07-05") }, // không nối được khách: bỏ qua
  ];
  const orders = [{ contactId: "e" }];
  const f = computeFunnel(contacts, deals, orders, { now: d("2026-09-15"), channelLabel: (k) => ({ ads: "Quảng cáo", zalo: "Zalo OA" })[k] ?? k });

  it("đếm từng tầng, tầng sau nằm trong tầng trước", () => {
    expect(f.stages.map((s) => s.count)).toEqual([5, 4, 4, 3, 1]);
    expect(f.stages[0].stepRate).toBeNull();
    expect(f.stages[1].stepRate).toBe(80);
    expect(f.stages[3].stepRate).toBe(75);
    expect(f.stages[4].ofTotal).toBe(20);
  });

  it("bảng theo kênh và nguồn", () => {
    const ads = f.byChannel.find((r) => r.key === "ads")!;
    expect(ads.label).toBe("Quảng cáo");
    expect(ads.counts).toEqual({ new: 3, contacted: 2, deal: 2, won: 2, repeat: 1 });
    expect(ads.winRate).toBe(66.7);
    expect(f.bySource.map((r) => r.key)).toEqual(["Facebook", "Zalo OA"]);
  });

  it("cohort cộng dồn theo tháng chốt đầu tiên, tháng tương lai để trống", () => {
    const jun = f.cohorts.find((c) => c.month === "2026-06")!;
    expect(jun.size).toBe(3);
    // a chốt tháng 6 (+0), b chốt tháng 8 (+2), c chưa chốt.
    expect(jun.cells).toEqual([33.3, 33.3, 66.7, 66.7, null, null]);
    const jul = f.cohorts.find((c) => c.month === "2026-07")!;
    // e chốt qua đơn hàng (tính tháng đầu), d chưa chốt.
    expect(jul.cells).toEqual([50, 50, 50, null, null, null]);
  });

  it("mua lại khi có 2 đơn hàng dù không có mục bán hàng", () => {
    expect(stagesOf(contact("x", "2026-01-01", "ads"), [], 2)).toEqual({ new: true, contacted: true, deal: true, won: true, repeat: true });
  });

  it("không có dữ liệu thì không chia cho 0", () => {
    const e = computeFunnel([], [], []);
    expect(e.stages.every((s) => s.count === 0 && (s.stepRate === null || s.stepRate === 0))).toBe(true);
    expect(e.cohorts).toEqual([]);
  });
});

describe("khoảng ngày", () => {
  it("mặc định 90 ngày, đọc được YYYY-MM-DD, đảo ngược thì về mặc định", () => {
    const r = parseRange(null, null);
    expect(Math.round((r.to.getTime() - r.from.getTime()) / 864e5)).toBe(90);
    const x = parseRange("2026-01-01", "2026-01-31");
    expect(x.from.getDate()).toBe(1);
    expect(x.to.getDate()).toBe(31);
    const bad = parseRange("2026-02-01", "2026-01-01");
    expect(Math.round((bad.to.getTime() - bad.from.getTime()) / 864e5)).toBe(90);
  });
});
