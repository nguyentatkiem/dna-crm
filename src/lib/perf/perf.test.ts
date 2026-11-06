import { describe, expect, it } from "vitest";
import { buildRows, buildTeamRows, revenueOwner, sumActuals, sumTargets, teamKey, teamTargets, viewDays, viewLabel, viewMonths, viewRange, type Actuals } from "@/lib/kpi";
import { commissionFor, csatScore, kpiScore, leaderBonus, normTiers, pickRoundRobin, rankOf, routeTeam, validateCriteria, weightedTotal, PERF_DEFAULT } from "./shared";
import { cleanManual, mergeScores } from "./review";
import { buildCommission } from "./commission";
import { shouldAlert } from "./alerts";
import { normTeam } from "./teams";

const z = { revenue: 0, won_deals: 0, new_contacts: 0, calls: 0, win_rate: 0, tickets_resolved: 0 };

describe("KPI theo quý / năm", () => {
  it("các tháng của kỳ xem", () => {
    expect(viewMonths("month", "2026-11")).toEqual(["2026-11"]);
    expect(viewMonths("quarter", "2026-11")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(viewMonths("quarter", "2026-01")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(viewMonths("year", "2026-05")).toHaveLength(12);
    expect(viewLabel("quarter", "2026-11")).toBe("Quý 4/2026");
    expect(viewLabel("year", "2026-11")).toBe("Năm 2026");
  });

  it("khoảng thời gian và số ngày đã qua theo giờ VN", () => {
    const r = viewRange("quarter", "2026-11");
    expect(r.from.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    const now = new Date("2026-11-06T03:00:00Z");
    expect(viewDays("quarter", "2026-11", now)).toEqual({ day: 31 + 6, days: 92 });
    expect(viewDays("year", "2026-11", now).days).toBe(365);
  });

  it("gộp chỉ tiêu: cộng dồn số đếm, tỉ lệ lấy trung bình các tháng có đặt", () => {
    const t = sumTargets([{ Lan: { revenue: 100, win_rate: 40 } }, { Lan: { revenue: 50, win_rate: 30 } }, { Lan: { revenue: 20 }, Minh: { calls: 5 } }]);
    expect(t.Lan).toEqual({ revenue: 170, win_rate: 35 });
    expect(t.Minh).toEqual({ calls: 5 });
  });
});

describe("KPI theo đội", () => {
  const actuals: Actuals = { Lan: { ...z, revenue: 100, won_deals: 3, win_rate: 75 }, Minh: { ...z, revenue: 50, won_deals: 1, win_rate: 25 } };
  const lost = { Lan: 1, Minh: 3 };

  it("thực tế đội = tổng; tỉ lệ chốt tính lại từ tổng thắng/thua, không trung bình", () => {
    const a = sumActuals(["Lan", "Minh", "Lan", ""], actuals, lost);
    expect(a.revenue).toBe(150);
    expect(a.won_deals).toBe(4);
    expect(a.win_rate).toBe(50); // 4 / (4 + 4), không phải (75 + 25) / 2 vẫn bằng 50 — thử thêm ca lệch:
    const b = sumActuals(["Lan", "Minh"], { Lan: { ...z, won_deals: 9 }, Minh: { ...z, won_deals: 1 } }, { Lan: 1, Minh: 9 });
    expect(b.win_rate).toBe(50);
    const c = sumActuals(["Lan", "Minh"], { Lan: { ...z, won_deals: 9 }, Minh: { ...z, won_deals: 0 } }, { Lan: 1, Minh: 1 });
    expect(c.win_rate).toBe(81.8); // 9/11, trung bình từng người sẽ là 45
  });

  it("chỉ tiêu đội: ô riêng ưu tiên, ô trống lấy tổng thành viên", () => {
    const r = teamTargets({ revenue: 500 }, ["Lan", "Minh"], { Lan: { revenue: 100, calls: 10, win_rate: 40 }, Minh: { calls: 20, win_rate: 30 } });
    expect(r.targets).toEqual({ revenue: 500, calls: 30, win_rate: 35 });
    expect(r.derived.sort()).toEqual(["calls", "win_rate"]);
  });

  it("bảng đội: xếp theo điểm, có hàng thành viên", () => {
    const teams = [
      { id: "a", name: "A", color: "#000000", leader: "Lan", members: ["Minh"] },
      { id: "b", name: "B", color: "#000000", leader: "", members: ["Minh"] },
    ];
    const rows = buildTeamRows(teams, actuals, lost, { [teamKey("a")]: { revenue: 150 }, [teamKey("b")]: { revenue: 500 } }, 30, 30);
    expect(rows.map((t) => t.id)).toEqual(["a", "b"]);
    expect(rows[0].row.cells.revenue).toMatchObject({ actual: 150, target: 150, pct: 100 });
    expect(rows[0].memberRows.map((r) => r.who).sort()).toEqual(["Lan", "Minh"]);
    expect(rows[0].row.who).toBe("team:a");
  });

  it("bảng người giữ nguyên hành vi cũ", () => {
    const rows = buildRows(["Lan"], { "": { ...z, calls: 40 }, Lan: { ...z, calls: 40 } }, { Lan: { calls: 100 } }, 15, 30);
    expect(rows[1].cells.calls).toMatchObject({ actual: 40, target: 100, pct: 40, expected: 50, status: "behind" });
  });

  it("người được tính doanh thu: giao dịch → khách → người tạo đơn → người lập phiếu", () => {
    expect(revenueOwner({ dealOwner: "Lan", contactOwner: "Minh", orderCreatedBy: "Chủ" })).toBe("Lan");
    expect(revenueOwner({ dealOwner: "", contactOwner: "Minh", orderCreatedBy: "Chủ" })).toBe("Minh");
    expect(revenueOwner({ orderCreatedBy: "", paymentCreatedBy: "Kế toán" })).toBe("Kế toán");
    expect(revenueOwner({})).toBe("");
  });
});

describe("Điểm đánh giá", () => {
  it("KPI % → điểm, trần 120%", () => {
    expect(kpiScore(120)).toBe(100);
    expect(kpiScore(200)).toBe(100);
    expect(kpiScore(60)).toBe(50);
    expect(kpiScore(0)).toBe(0);
    expect(kpiScore(-5)).toBe(0);
    expect(csatScore(4.5)).toBe(90);
  });

  it("tổng có trọng số, bỏ tiêu chí chưa có điểm khỏi mẫu số", () => {
    const c = PERF_DEFAULT.criteria;
    expect(weightedTotal(c, { revenue: 100, win_rate: 100, csat: 100, attitude: 100, teamwork: 100 })).toBe(100);
    expect(weightedTotal(c, { revenue: 50, win_rate: 100, csat: 80, attitude: 90, teamwork: 70 })).toBe(72.5);
    // Chưa đặt chỉ tiêu tỉ lệ chốt, chưa có CSAT: chỉ tính 3 tiêu chí còn lại (40 + 15 + 10).
    expect(weightedTotal(c, { revenue: 80, win_rate: null, attitude: 100, teamwork: 60 })).toBe(81.5);
    expect(weightedTotal(c, {})).toBe(0);
    expect(weightedTotal([{ id: "x", weight: 10 }], { x: 150 })).toBe(100);
  });

  it("xếp loại", () => {
    expect(rankOf(95)).toBe("excellent");
    expect(rankOf(90)).toBe("excellent");
    expect(rankOf(80)).toBe("good");
    expect(rankOf(60)).toBe("pass");
    expect(rankOf(59.9)).toBe("improve");
  });

  it("ghép điểm: tự động lấy số mới, chấm tay lấy đã lưu, đã chốt dùng bản chụp", () => {
    const c = PERF_DEFAULT.criteria;
    const auto = { revenue: 90, win_rate: 70, csat: null };
    expect(mergeScores(c, auto, { attitude: 80, revenue: 10 }, false)).toEqual({ revenue: 90, win_rate: 70, csat: null, attitude: 80, teamwork: null });
    expect(mergeScores(c, auto, { revenue: 10, win_rate: 20, csat: 30, attitude: 40, teamwork: 50 }, true)).toEqual({ revenue: 10, win_rate: 20, csat: 30, attitude: 40, teamwork: 50 });
    expect(cleanManual(c, { attitude: 120.4, teamwork: null, revenue: 5 })).toEqual({ attitude: 100, teamwork: null });
  });

  it("kiểm tra bộ tiêu chí", () => {
    expect(validateCriteria(PERF_DEFAULT.criteria)).toBe("");
    expect(validateCriteria([])).not.toBe("");
    expect(validateCriteria([{ id: "a", label: "A", weight: 0, source: "manual" }])).not.toBe("");
    expect(validateCriteria([{ id: "a", label: "A", weight: 5, source: "manual" }, { id: "a", label: "B", weight: 5, source: "manual" }])).toContain("trùng");
  });
});

describe("Hoa hồng", () => {
  const tiers = [
    { from: 0, pct: 3 },
    { from: 50_000_000, pct: 5 },
    { from: 100_000_000, pct: 7 },
  ];

  it("lũy tiến từng phần", () => {
    expect(commissionFor(40_000_000, { mode: "progressive", tiers })).toBe(1_200_000);
    // 50tr × 3% + 50tr × 5% + 20tr × 7%
    expect(commissionFor(120_000_000, { mode: "progressive", tiers })).toBe(1_500_000 + 2_500_000 + 1_400_000);
    expect(commissionFor(0, { mode: "progressive", tiers })).toBe(0);
  });

  it("theo bậc: cả doanh thu nhân % bậc đạt được", () => {
    expect(commissionFor(120_000_000, { mode: "bracket", tiers })).toBe(8_400_000);
    expect(commissionFor(50_000_000, { mode: "bracket", tiers })).toBe(2_500_000);
    expect(commissionFor(49_999_999, { mode: "bracket", tiers })).toBe(1_500_000);
  });

  it("bậc lệch thứ tự, mốc đầu > 0, bậc lỗi", () => {
    const messy = [{ from: 100, pct: 10 }, { from: 0, pct: 1 }, { from: -5, pct: 50 }, { from: 100, pct: 20 }];
    expect(normTiers(messy)).toEqual([{ from: 0, pct: 1 }, { from: 100, pct: 20 }]);
    expect(commissionFor(50, { mode: "progressive", tiers: [{ from: 100, pct: 10 }] })).toBe(0);
    expect(commissionFor(150, { mode: "progressive", tiers: [{ from: 100, pct: 10 }] })).toBe(5);
    expect(commissionFor(150, { mode: "bracket", tiers: [] })).toBe(0);
  });

  it("thưởng trưởng nhóm và bảng hoa hồng", () => {
    expect(leaderBonus([100_000_000, 50_000_000, -1], 1)).toBe(1_500_000);
    expect(leaderBonus([100], 0)).toBe(0);
    const rows = buildCommission(["Lan", "Minh", "Hà"], { Lan: { revenue: 40_000_000, orders: 2 }, Minh: { revenue: 60_000_000, orders: 3 } }, [{ name: "KD", leader: "Lan", members: ["Minh", "Hà"] }], { base: "paid", mode: "progressive", tiers, teamLeaderPct: 1 });
    const lan = rows.find((r) => r.who === "Lan")!;
    expect(lan.commission).toBe(1_200_000);
    expect(lan.leaderBonus).toBe(600_000); // 1% × doanh thu Minh (không tính doanh thu của chính trưởng nhóm)
    expect(lan.total).toBe(1_800_000);
    expect(rows[0].who).toBe("Minh"); // 2tr hoa hồng > 1,8tr
    expect(rows.find((r) => r.who === "Hà")).toMatchObject({ revenue: 0, total: 0, teams: ["KD"] });
  });
});

describe("Phân luồng phiếu và cảnh báo", () => {
  const routing = { rules: [{ category: "Khiếu nại", teamId: "cskh" }, { category: "Tư vấn", teamId: "kd" }], defaultTeamId: "cskh" };

  it("đội theo phân loại, không khớp thì đội mặc định", () => {
    expect(routeTeam(routing, "Tư vấn")).toBe("kd");
    expect(routeTeam(routing, " khiếu NẠI ")).toBe("cskh");
    expect(routeTeam(routing, "Khác")).toBe("cskh");
    expect(routeTeam({ rules: [], defaultTeamId: "" }, "Khác")).toBe("");
  });

  it("xoay vòng trong đội", () => {
    const m = ["Lan", "Minh", "Hà"];
    expect(pickRoundRobin(m, 0)).toEqual({ name: "Lan", next: 1 });
    expect(pickRoundRobin(m, 2)).toEqual({ name: "Hà", next: 0 });
    // Đội bớt người: con trỏ cũ vượt quá thì quay vòng lại.
    expect(pickRoundRobin(["Lan", "Minh"], 5)).toEqual({ name: "Minh", next: 0 });
    expect(pickRoundRobin([], 3)).toEqual({ name: "", next: 0 });
  });

  it("cảnh báo từ ngày 10, chậm nhịp quá 20%", () => {
    // Ngày 15/30, chỉ tiêu 100 → nhịp cần 50.
    expect(shouldAlert(39, 100, 15, 30)).toBe(true);
    expect(shouldAlert(41, 100, 15, 30)).toBe(false);
    expect(shouldAlert(0, 100, 9, 30)).toBe(false);
    expect(shouldAlert(0, 0, 15, 30)).toBe(false);
  });

  it("chuẩn hoá đội", () => {
    expect(normTeam({ name: "  Kinh   doanh ", leader: "Lan", members: ["Lan", " Minh ", "", "Minh"], color: "bad" })).toEqual({ name: "Kinh doanh", leader: "Lan", members: ["Minh"], color: "#579bfc" });
  });
});
