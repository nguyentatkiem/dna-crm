import { describe, expect, it } from "vitest";
import { behindBy, buildRows, currentPeriod, dayOfPeriod, daysIn, expectedPace, isPeriod, monthRange, paceStatus, prevPeriod, progressPct, teamOf, weekKey, winRate } from "@/lib/kpi";

describe("KPI: nhịp và trạng thái", () => {
  it("nhịp kỳ vọng = chỉ tiêu × ngày / số ngày; tỉ lệ thì giữ nguyên", () => {
    expect(expectedPace(300, 10, 30)).toBe(100);
    expect(expectedPace(300, 40, 30)).toBe(300);
    expect(expectedPace(0, 10, 30)).toBe(0);
    expect(expectedPace(40, 3, 30, true)).toBe(40);
  });

  it("Vượt ≥ 110%, Đúng nhịp ≥ 90%, còn lại Đang chậm", () => {
    expect(paceStatus(120, 300, 10, 30)).toBe("ahead");
    expect(paceStatus(95, 300, 10, 30)).toBe("on");
    expect(paceStatus(50, 300, 10, 30)).toBe("behind");
    expect(paceStatus(10, 0, 10, 30)).toBe("none");
    expect(paceStatus(10, 100, 0, 30)).toBe("none");
    expect(paceStatus(30, 40, 5, 30, true)).toBe("behind");
  });

  it("chậm bao nhiêu phần so với nhịp", () => {
    expect(behindBy(70, 300, 10, 30)).toBeCloseTo(0.3);
    expect(behindBy(120, 300, 10, 30)).toBeLessThan(0);
  });

  it("tỉ lệ chốt và % hoàn thành", () => {
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(1, 2)).toBe(33.3);
    expect(winRate(0, 0)).toBe(0);
    expect(progressPct(45, 60)).toBe(75);
    expect(progressPct(5, 0)).toBe(0);
  });
});

describe("KPI: kỳ và ngày theo giờ Việt Nam", () => {
  it("kỳ hợp lệ, kỳ trước, số ngày", () => {
    expect(isPeriod("2026-11")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(prevPeriod("2026-01")).toBe("2025-12");
    expect(daysIn("2028-02")).toBe(29);
  });

  it("đầu tháng tính theo UTC+7", () => {
    const { from, to } = monthRange("2026-11");
    expect(from.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    // 18h UTC ngày 31/10 đã là 1h sáng 1/11 ở Việt Nam.
    expect(currentPeriod(new Date("2026-10-31T18:00:00Z"))).toBe("2026-11");
  });

  it("ngày đã qua của kỳ: quá khứ = đủ tháng, tương lai = 0", () => {
    const now = new Date("2026-11-06T03:00:00Z");
    expect(dayOfPeriod("2026-11", now)).toBe(6);
    expect(dayOfPeriod("2026-10", now)).toBe(31);
    expect(dayOfPeriod("2026-12", now)).toBe(0);
  });

  it("mã tuần ISO", () => {
    expect(weekKey(new Date("2026-11-02T02:00:00Z"))).toBe("2026-W45");
    expect(weekKey(new Date("2027-01-01T02:00:00Z"))).toBe("2026-W53");
  });
});

describe("KPI: ghép bảng", () => {
  it("đội = cấu hình + thành viên, bỏ trùng", () => {
    expect(teamOf({ team: ["Lan", "Minh "] }, ["Minh", "Chủ", ""])).toEqual(["Lan", "Minh", "Chủ"]);
  });

  it("hàng cả công ty đứng đầu, có % và trạng thái", () => {
    const z = { revenue: 0, won_deals: 0, new_contacts: 0, calls: 0, win_rate: 0, tickets_resolved: 0 };
    const rows = buildRows(["Lan"], { "": { ...z, calls: 40 }, Lan: { ...z, calls: 40 } }, { Lan: { calls: 100 } }, 15, 30);
    expect(rows.map((r) => r.who)).toEqual(["", "Lan"]);
    expect(rows[1].cells.calls).toMatchObject({ actual: 40, target: 100, pct: 40, expected: 50, status: "behind" });
    expect(rows[0].cells.calls.status).toBe("none");
  });
});
