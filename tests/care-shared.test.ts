import { describe, expect, it } from "vitest";
import { LOYALTY_DEFAULT, TICKET_DEFAULT, addMonths, isOverdue, maskSerial, nextTier, normPhone, pointsFor, slaDueAt, summarize, tierFor } from "@/lib/care/shared";

const tiers = LOYALTY_DEFAULT.tiers;

describe("hạng thành viên", () => {
  it("lấy hạng cao nhất đạt được theo điểm đã tích", () => {
    expect(tierFor(0, tiers).name).toBe("Thành viên");
    expect(tierFor(499, tiers).name).toBe("Thành viên");
    expect(tierFor(500, tiers).name).toBe("Bạc");
    expect(tierFor(2000, tiers).name).toBe("Vàng");
    expect(tierFor(99999, tiers).name).toBe("Kim cương");
  });
  it("không phụ thuộc thứ tự khai báo", () => {
    expect(tierFor(2500, [...tiers].reverse()).name).toBe("Vàng");
  });
  it("hạng kế tiếp và số điểm còn thiếu", () => {
    expect(nextTier(1500, tiers)).toMatchObject({ tier: { name: "Vàng" }, need: 500 });
    expect(nextTier(6000, tiers)).toBeNull();
  });
  it("đổi quà trừ số dư nhưng không làm tụt hạng", () => {
    const s = summarize([
      { points: 2100, createdAt: "2026-01-01" },
      { points: -1500, createdAt: "2026-02-01" },
    ]);
    expect(s).toMatchObject({ balance: 600, earned: 2100 });
    expect(tierFor(s.earned, tiers).name).toBe("Vàng");
  });
});

describe("tính điểm đơn hàng", () => {
  it("làm tròn xuống theo số tiền mỗi điểm", () => {
    expect(pointsFor(1_259_000, 10_000)).toBe(125);
    expect(pointsFor(9_999, 10_000)).toBe(0);
    expect(pointsFor(-50_000, 10_000)).toBe(0);
    expect(pointsFor(100_000, 0)).toBe(0);
  });
});

describe("SLA phiếu hỗ trợ", () => {
  const from = new Date("2026-11-06T08:00:00Z");
  it("hạn = giờ tạo + số giờ theo mức ưu tiên", () => {
    expect(slaDueAt("urgent", TICKET_DEFAULT, from)?.toISOString()).toBe("2026-11-06T12:00:00.000Z");
    expect(slaDueAt("low", TICKET_DEFAULT, from)?.toISOString()).toBe("2026-11-09T08:00:00.000Z");
  });
  it("0 giờ = không đặt hạn", () => {
    expect(slaDueAt("normal", { slaHours: { ...TICKET_DEFAULT.slaHours, normal: 0 } }, from)).toBeNull();
  });
  it("chỉ phiếu chưa xử lý mới tính quá hạn", () => {
    const now = from.getTime() + 5 * 3600e3;
    expect(isOverdue({ dueAt: "2026-11-06T12:00:00Z", status: "open" }, now)).toBe(true);
    expect(isOverdue({ dueAt: "2026-11-06T12:00:00Z", status: "resolved" }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: "open" }, now)).toBe(false);
  });
});

describe("bảo hành", () => {
  it("cộng tháng giữ ngày cuối tháng hợp lệ", () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
    expect(addMonths(new Date(2026, 4, 15), 12).getFullYear()).toBe(2027);
  });
  it("chuẩn hoá SĐT và che serial", () => {
    expect(normPhone("+84 901 234 567")).toBe("0901234567");
    expect(normPhone("0901.234.567")).toBe("0901234567");
    expect(maskSerial("RM2025-00871")).toBe("RM•••••••871");
    expect(maskSerial("AB12")).toBe("A•••");
  });
});
