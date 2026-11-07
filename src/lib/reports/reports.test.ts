import { describe, expect, it } from "vitest";
import type { WorkspaceConfig } from "../config/schema";
import { aggregate, blankConfig, bucketOf, bucketsBetween, datasetFields, isDue, lastSlot, matchFilter, rangeOf, validateConfig, vnDate, type ReportConfig, type Row } from "./shared";
import { reportTemplates } from "./templates";
import { pushDown } from "./engine";

const cfg = {
  objects: [
    { key: "contacts", label: "Khách", itemLabel: "khách", description: "", statusLabel: "Trạng thái", amountLabel: "Giá trị", statuses: [{ key: "moi", label: "Mới", color: "blue" }], fields: [{ key: "nguon", label: "Nguồn", type: "select", options: [{ key: "fb", label: "Facebook", color: "blue" }] }, { key: "sdt", label: "SĐT", type: "phone", options: [] }] },
    { key: "deals", label: "Giao dịch", itemLabel: "giao dịch", description: "", statusLabel: "Giai đoạn", amountLabel: "Giá trị", statuses: [{ key: "won", label: "Thắng", color: "green" }, { key: "lost", label: "Thua", color: "red" }, { key: "open", label: "Mở", color: "blue" }], fields: [] },
  ],
} as unknown as WorkspaceConfig;

const iso = (d: Date | null) => d?.toISOString();

describe("khoảng ngày theo giờ Việt Nam", () => {
  // 2026-11-07 01:30 giờ VN = 2026-11-06 18:30 UTC (thứ bảy theo giờ VN)
  const now = new Date("2026-11-06T18:30:00Z");
  it("hôm nay tính theo ngày VN, không theo UTC", () => {
    const r = rangeOf({ preset: "today" }, now);
    expect(iso(r.from)).toBe("2026-11-06T17:00:00.000Z");
    expect(iso(r.to)).toBe("2026-11-07T17:00:00.000Z");
  });
  it("7 ngày qua gồm hôm nay", () => {
    const r = rangeOf({ preset: "last7" }, now);
    expect(iso(r.from)).toBe("2026-10-31T17:00:00.000Z");
  });
  it("tuần này bắt đầu thứ hai", () => {
    const r = rangeOf({ preset: "this_week" }, now);
    expect(iso(r.from)).toBe("2026-11-01T17:00:00.000Z"); // 00:00 thứ hai 02/11 VN
  });
  it("tháng trước / quý / năm", () => {
    expect(iso(rangeOf({ preset: "last_month" }, now).from)).toBe("2026-09-30T17:00:00.000Z");
    expect(iso(rangeOf({ preset: "this_quarter" }, now).from)).toBe("2026-09-30T17:00:00.000Z");
    expect(iso(rangeOf({ preset: "last_quarter" }, now).to)).toBe("2026-09-30T17:00:00.000Z");
    expect(iso(rangeOf({ preset: "this_year" }, now).from)).toBe("2025-12-31T17:00:00.000Z");
  });
  it("tuỳ chọn gồm cả ngày cuối", () => {
    const r = rangeOf({ preset: "custom", from: "2026-01-01", to: "2026-01-31" }, now);
    expect(iso(r.to)).toBe("2026-01-31T17:00:00.000Z");
    expect(r.label).toBe("01/01/2026 – 31/01/2026");
  });
  it("toàn bộ thời gian không giới hạn", () => {
    expect(rangeOf({ preset: "all" }, now).from).toBeNull();
  });
});

describe("mốc thời gian", () => {
  it("nhóm theo ngày/tuần/tháng theo giờ VN", () => {
    const d = new Date("2026-11-06T18:30:00Z"); // 07/11 VN
    expect(bucketOf(d, "day").key).toBe("2026-11-07");
    expect(bucketOf(d, "week").key).toBe("2026-11-02");
    expect(bucketOf(d, "month").label).toBe("T11/2026");
    expect(bucketOf(d, "quarter").key).toBe("2026-Q4");
  });
  it("đủ mốc tháng trong năm", () => {
    expect(bucketsBetween(vnDate(2026, 1, 1), vnDate(2027, 1, 1), "month")).toHaveLength(12);
    expect(bucketsBetween(vnDate(2026, 11, 1), vnDate(2026, 11, 8), "day")).toHaveLength(7);
  });
});

describe("kiểm tra cấu hình", () => {
  it("từ chối trường lạ (chống tiêm tên cột)", () => {
    const r = validateConfig({ ...blankConfig("orders"), groupBy: { field: "passwordHash" } }, cfg);
    expect(r.ok).toBe(false);
    const r2 = validateConfig({ ...blankConfig("orders"), filters: [{ field: "a; DROP TABLE", op: "eq", value: 1 }] }, cfg);
    expect(r2.ok).toBe(false);
  });
  it("sum cần trường số, rate cần trường có/không", () => {
    expect(validateConfig({ ...blankConfig("orders"), metrics: [{ op: "sum", field: "status" }] }, cfg).ok).toBe(false);
    expect(validateConfig({ ...blankConfig("deals"), metrics: [{ op: "rate", field: "won" }] }, cfg).ok).toBe(true);
  });
  it("điền đơn vị ngày khi nhóm theo trường ngày", () => {
    const r = validateConfig({ ...blankConfig("orders"), groupBy: { field: "createdAt" } }, cfg);
    expect(r.ok && r.config.groupBy?.bucket).toBe("day");
  });
  it("tuỳ chọn ngày phải đủ và đúng thứ tự", () => {
    expect(validateConfig({ ...blankConfig(), range: { preset: "custom", from: "2026-02-01" } }, cfg).ok).toBe(false);
    expect(validateConfig({ ...blankConfig(), range: { preset: "custom", from: "2026-02-01", to: "2026-01-01" } }, cfg).ok).toBe(false);
  });
  it("trường tuỳ biến: có select, bỏ SĐT", () => {
    const keys = datasetFields("contacts", cfg).map((f) => f.key);
    expect(keys).toContain("d_nguon");
    expect(keys).not.toContain("d_sdt");
  });
  it("6 mẫu đều hợp lệ", () => {
    const ts = reportTemplates(cfg);
    expect(ts).toHaveLength(6);
    for (const t of ts) expect(validateConfig(t.config, cfg), t.key).toMatchObject({ ok: true });
    expect(ts.find((t) => t.key === "new_contacts_source")!.config.groupBy!.field).toBe("d_nguon");
  });
});

describe("gom nhóm & chỉ số", () => {
  const fields = datasetFields("deals", cfg);
  const rows: Row[] = [
    { ownerName: "An", status: "won", amount: 100, won: true, createdAt: new Date("2026-11-01T03:00:00Z") },
    { ownerName: "An", status: "lost", amount: 50, won: false, createdAt: new Date("2026-11-02T03:00:00Z") },
    { ownerName: "Bình", status: "won", amount: 300, won: true, createdAt: new Date("2026-11-02T03:00:00Z") },
    { ownerName: "", status: "open", amount: 0, won: false, createdAt: new Date("2026-11-03T03:00:00Z") },
  ];
  const c = (x: Partial<ReportConfig>): ReportConfig => ({ ...blankConfig("deals"), ...x });
  it("nhóm theo người phụ trách, tỉ lệ chốt, sắp xếp", () => {
    const r = aggregate(rows, c({ groupBy: { field: "ownerName" }, metrics: [{ op: "count" }, { op: "rate", field: "won" }, { op: "sum", field: "amount" }], sort: { by: "m2", dir: "desc" } }), fields);
    expect(r.mode).toBe("group");
    expect(r.rows[0]).toEqual(["Bình", 1, 100, 300]);
    expect(r.rows[1]).toEqual(["An", 2, 50, 150]);
    expect(r.rows[2][0]).toBe("(Chưa giao)");
    expect(r.totals).toEqual([4, 50, 450]);
  });
  it("nhóm theo ngày điền đủ ngày trống trong khoảng", () => {
    const range = { from: vnDate(2026, 11, 1), to: vnDate(2026, 11, 5), label: "" };
    const r = aggregate(rows, c({ groupBy: { field: "createdAt", bucket: "day" } }), fields, { range });
    expect(r.rows.map((x) => x[0])).toEqual(["01/11", "02/11", "03/11", "04/11"]);
    expect(r.rows.map((x) => x[1])).toEqual([1, 2, 1, 0]);
  });
  it("giới hạn số nhóm", () => {
    const r = aggregate(rows, c({ groupBy: { field: "status" }, limit: 2 }), fields);
    expect(r.rows).toHaveLength(2);
    expect(r.hiddenGroups).toBe(1);
  });
  it("bộ lọc trong JS: neq, contains không dấu, ngày ≤ gồm cả ngày", () => {
    const f = (k: string) => fields.find((x) => x.key === k)!;
    expect(matchFilter({ status: "won" }, { field: "status", op: "neq", value: "lost" }, f("status"))).toBe(true);
    expect(matchFilter({ ownerName: "Bình" }, { field: "ownerName", op: "contains", value: "binh" }, f("ownerName"))).toBe(true);
    expect(matchFilter({ createdAt: new Date("2026-11-02T10:00:00Z") }, { field: "createdAt", op: "lte", value: "2026-11-02" }, f("createdAt"))).toBe(true);
    expect(matchFilter({ createdAt: new Date("2026-11-02T18:00:00Z") }, { field: "createdAt", op: "lte", value: "2026-11-02" }, f("createdAt"))).toBe(false);
  });
  it("tổng không nhóm và chế độ danh sách", () => {
    expect(aggregate(rows, c({ metrics: [{ op: "avg", field: "amount" }] }), fields).rows).toEqual([[112.5]]);
    const l = aggregate(rows, c({ columns: ["title", "amount"], limit: 2 }), fields);
    expect(l.mode).toBe("list");
    expect(l.rows).toHaveLength(2);
  });
  it("đẩy bộ lọc cột thật xuống Prisma, phần còn lại lọc JS", () => {
    const { where, rest } = pushDown(
      [
        { field: "status", op: "neq", value: "lost" },
        { field: "amount", op: "gte", value: "100" },
        { field: "won", op: "eq", value: true },
        { field: "ownerName", op: "contains", value: "an" },
      ],
      fields,
    );
    expect(where).toEqual([{ NOT: { status: "lost" } }, { amount: { gte: 100 } }]);
    expect(rest.map((r) => r.field)).toEqual(["won", "ownerName"]);
  });
});

describe("lịch gửi", () => {
  const now = new Date("2026-11-06T02:10:00Z"); // 09:10 thứ sáu 06/11 VN
  it("hằng ngày 8h: kỳ gần nhất là 8h hôm nay", () => {
    expect(iso(lastSlot({ freq: "daily", hour: 8, weekday: 1, day: 1 }, now))).toBe("2026-11-06T01:00:00.000Z");
    expect(iso(lastSlot({ freq: "daily", hour: 10, weekday: 1, day: 1 }, now))).toBe("2026-11-05T03:00:00.000Z");
  });
  it("hằng tuần thứ hai 8h", () => {
    expect(iso(lastSlot({ freq: "weekly", hour: 8, weekday: 1, day: 1 }, now))).toBe("2026-11-02T01:00:00.000Z");
  });
  it("hằng tháng ngày 31 → ngày cuối tháng", () => {
    expect(iso(lastSlot({ freq: "monthly", hour: 8, weekday: 1, day: 31 }, now))).toBe("2026-10-31T01:00:00.000Z");
    expect(iso(lastSlot({ freq: "monthly", hour: 8, weekday: 1, day: 31 }, new Date("2026-03-01T00:00:00Z")))).toBe("2026-02-28T01:00:00.000Z");
  });
  it("mỗi kỳ gửi một lần, không gửi bù quá muộn, không gửi kỳ trước khi tạo", () => {
    const s = { freq: "daily" as const, hour: 8, weekday: 1, day: 1 };
    const created = new Date("2026-10-01T00:00:00Z");
    const slot = isDue(s, null, created, now);
    expect(iso(slot)).toBe("2026-11-06T01:00:00.000Z");
    expect(isDue(s, now, created, new Date(now.getTime() + 15 * 60e3))).toBeNull();
    expect(isDue(s, null, created, new Date("2026-11-06T05:00:00Z"))).toBeNull(); // 4 giờ sau kỳ
    expect(isDue(s, null, new Date("2026-11-06T01:30:00Z"), now)).toBeNull();
    expect(isDue({ ...s, freq: "off" }, null, created, now)).toBeNull();
  });
});
