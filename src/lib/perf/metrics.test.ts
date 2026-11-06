import { describe, expect, it } from "vitest";
import {
  buildAlerts,
  computeMetrics,
  delta,
  duration,
  emptyFacts,
  fmtValue,
  funnel,
  heatmap,
  median,
  medians,
  METRIC_DEFS,
  METRIC_KEYS,
  metricReviewScore,
  normWeights,
  percentile,
  perfScores,
  ranks,
  rate,
  resolveRange,
  SCORE_DEFAULT,
  strengthsWeaknesses,
  weekSpans,
  weeklySeries,
  zScore,
  type Facts,
  type Values,
} from "./metrics";
import { buildAccess } from "./access";
import { digestLine } from "./digest";

const H = 3600e3;
const D = 864e5;
// 2026-11-02 00:00 giờ VN (thứ Hai) = 2026-11-01T17:00Z
const MON = Date.parse("2026-11-01T17:00:00Z");
const span = { from: MON, to: MON + 7 * D };

function facts(over: Partial<Facts> = {}): Facts {
  return { ...emptyFacts(MON + 7 * D), ...over };
}

describe("thống kê cơ bản", () => {
  it("trung vị, tỉ lệ, delta", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([1, NaN, 3])).toBe(2);
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(0, 0)).toBeNull();
    expect(delta(120, 100)).toEqual({ abs: 20, pct: 20, better: true });
    expect(delta(80, 100, false)).toEqual({ abs: -20, pct: -20, better: true });
    expect(delta(5, 0)).toEqual({ abs: 5, pct: null, better: true });
    expect(delta(5, 5)).toEqual({ abs: 0, pct: 0, better: null });
    expect(delta(null, 5)).toBeNull();
  });

  it("bách phân vị trung điểm hạng, đảo chiều, z-score", () => {
    expect(percentile(10, [10, 20, 30, 40])).toBe(13); // (0 + 0.5) / 4
    expect(percentile(40, [10, 20, 30, 40])).toBe(88);
    expect(percentile(40, [10, 20, 30, 40], false)).toBe(13);
    expect(percentile(7, [7])).toBe(50);
    expect(percentile(7, [])).toBe(50);
    expect(percentile(20, [20, 20])).toBe(50);
    expect(zScore(30, [10, 20, 30])).toBe(1.2);
    expect(zScore(5, [5, 5])).toBe(0);
  });

  it("định dạng", () => {
    expect(fmtValue("revenue", 12_500_000)).toBe("12,5 tr");
    expect(fmtValue("win_rate", 33.3)).toBe("33,3%");
    expect(fmtValue("speed_to_lead", 30)).toBe("30 phút");
    expect(fmtValue("speed_to_lead", 150)).toBe("2,5 giờ");
    expect(fmtValue("ticket_resolve", 72)).toBe("3 ngày");
    expect(fmtValue("nps", 40)).toBe("+40");
    expect(fmtValue("csat", null)).toBe("—");
    expect(duration(0.2)).toBe("< 1 phút");
    expect(duration(3 * 1440)).toBe("3 ngày");
  });

  it("mọi chỉ số đều có định nghĩa đầy đủ", () => {
    for (const k of METRIC_KEYS) {
      expect(METRIC_DEFS[k].label).toBeTruthy();
      expect(METRIC_DEFS[k].formula.length).toBeGreaterThan(20);
    }
  });
});

describe("khoảng thời gian (giờ VN)", () => {
  const now = Date.parse("2026-11-06T03:00:00Z"); // 10:00 ngày 06/11 giờ VN

  it("7 ngày gồm cả hôm nay, kỳ trước liền kề cùng độ dài", () => {
    const r = resolveRange("7d", now);
    expect(new Date(r.cur.from).toISOString()).toBe("2026-10-30T17:00:00.000Z"); // 00:00 31/10 VN
    expect(r.cur.to).toBe(now);
    expect(r.prev.to).toBe(r.cur.from);
    expect(r.prev.to - r.prev.from).toBe(r.cur.to - r.cur.from);
  });

  it("tháng này, quý này", () => {
    expect(new Date(resolveRange("month", now).cur.from).toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(new Date(resolveRange("quarter", now).cur.from).toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("tùy chọn: hết ngày cuối, không vượt hôm nay, tối đa 366 ngày, sai → 30 ngày", () => {
    const r = resolveRange("custom", now, "2026-10-01", "2026-10-31");
    expect(new Date(r.cur.from).toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(new Date(r.cur.to).toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(r.label).toBe("01/10/2026 – 31/10/2026");
    const big = resolveRange("custom", now, "2020-01-01", "2026-11-01");
    expect((big.cur.to - big.cur.from) / D).toBe(366);
    expect(resolveRange("custom", now, "x", "2026-10-01").preset).toBe("30d");
    expect(resolveRange("custom", now, "2026-10-05", "2026-10-01").preset).toBe("30d");
    expect(resolveRange("bogus", now).preset).toBe("30d");
  });

  it("tuần thứ Hai → thứ Hai", () => {
    const w = weekSpans(now, 3);
    expect(w).toHaveLength(3);
    expect(new Date(w[2].from).toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(w[2].to).toBe(now);
    expect(w[2].label).toBe("02/11");
    expect(w[1].to).toBe(w[2].from);
  });
});

describe("tính chỉ số từ dữ liệu thô", () => {
  const f = facts({
    revenueSource: "payments",
    payments: [
      { who: "Lan", at: MON + H, amount: 10_000_000 },
      { who: "Lan", at: MON - H, amount: 99 }, // ngoài kỳ
      { who: "Minh", at: MON + 2 * H, amount: 5_000_000 },
    ],
    closed: [
      { who: "Lan", at: MON + 3 * H, won: true, amount: 8_000_000, createdAt: MON - 4 * D },
      { who: "Lan", at: MON + 4 * H, won: true, amount: 2_000_000, createdAt: MON - 2 * D },
      { who: "Lan", at: MON + 5 * H, won: false, amount: 1, createdAt: MON - D },
      { who: "Minh", at: MON + 5 * H, won: false, amount: 1, createdAt: MON - D },
    ],
    leads: [
      { who: "Lan", at: MON, firstTouch: MON + 10 * 60e3 },
      { who: "Lan", at: MON + D, firstTouch: MON + D + 30 * 60e3 },
      { who: "Lan", at: MON + 2 * D, firstTouch: null },
      { who: "Lan", at: MON + 3 * D, firstTouch: MON + 3 * D - 1 }, // điểm chạm trước lúc vào: bỏ
    ],
    orders: [
      { who: "Lan", at: MON + H, contactId: "k1", returning: true },
      { who: "Lan", at: MON + 2 * H, contactId: "k1", returning: false },
      { who: "Lan", at: MON + 3 * H, contactId: "k2", returning: false },
      { who: "Lan", at: MON + 4 * H, contactId: null, returning: false },
    ],
    calls: [
      { who: "Lan", at: MON + H, dur: 120, outcome: "appointment", score: 80 },
      { who: "Lan", at: MON + 2 * H, dur: 0, outcome: "no_answer", score: null },
      { who: "Lan", at: MON + 3 * H, dur: 60, outcome: "connected", score: 60 },
      { who: "Lan", at: MON + 4 * H, dur: 0, outcome: "busy", score: null },
    ],
    replies: [{ who: "Lan", at: MON + H }],
    responses: [
      { who: "Lan", at: MON + H, min: 4 },
      { who: "Lan", at: MON + 2 * H, min: 10 },
      { who: "Lan", at: MON + 3 * H, min: 100 },
    ],
    tasks: [
      { who: "Lan", due: MON + H, done: true },
      { who: "Lan", due: MON + 2 * H, done: false },
      { who: "Lan", due: MON + 30 * D, done: false }, // ngoài kỳ
    ],
    tickets: [
      { who: "Lan", createdAt: MON, resolvedAt: MON + 2 * H, dueAt: MON + 4 * H, csat: 5 },
      { who: "Lan", createdAt: MON, resolvedAt: MON + 6 * H, dueAt: MON + 4 * H, csat: 4 },
      { who: "Lan", createdAt: MON, resolvedAt: null, dueAt: null, csat: null },
    ],
    surveys: [
      { who: "Lan", at: MON + H, nps: 10 },
      { who: "Lan", at: MON + H, nps: 9 },
      { who: "Lan", at: MON + H, nps: 3 },
      { who: "Lan", at: MON + H, nps: 8 },
    ],
    complaints: [{ who: "Lan", at: MON + H }],
    debts: { Lan: { amount: 3_000_000, count: 1 }, Minh: { amount: 1_000_000, count: 2 } },
    stale: [{ who: "Lan", id: "d1", title: "x", amount: 0, idleDays: 20 }],
  });

  it("một người", () => {
    const v = computeMetrics(f, "Lan", span);
    expect(v.revenue).toBe(10_000_000);
    expect(v.won_deals).toBe(2);
    expect(v.avg_deal).toBe(5_000_000);
    expect(v.win_rate).toBe(66.7);
    expect(v.new_contacts).toBe(4);
    expect(v.orders).toBe(4);
    expect(v.overdue_debt).toBe(3_000_000);
    expect(v.calls).toBe(4);
    expect(v.call_minutes).toBe(3);
    expect(v.call_connect_rate).toBe(50);
    expect(v.call_positive_rate).toBe(25);
    expect(v.call_quality).toBe(70);
    expect(v.replies).toBe(1);
    expect(v.tasks_done).toBe(1);
    expect(v.task_ontime).toBe(50);
    expect(v.speed_to_lead).toBe(20); // trung vị 10 và 30 phút
    expect(v.first_response).toBe(10);
    expect(v.ticket_resolve).toBe(4);
    expect(v.ticket_sla).toBe(50);
    expect(v.sales_cycle).toBe(3.1); // trung vị (4d+3h, 2d+4h)
    expect(v.stale_deals).toBe(1);
    expect(v.csat).toBe(4.5);
    expect(v.nps).toBe(25); // (2 − 1) / 4
    expect(v.repeat_rate).toBe(50); // k1 quay lại, k2 không
    expect(v.complaints).toBe(1);
  });

  it("không có dữ liệu → null cho tỉ lệ/trung vị, 0 cho số đếm", () => {
    const v = computeMetrics(f, "Ai đó", span);
    expect(v.revenue).toBe(0);
    expect(v.calls).toBe(0);
    expect(v.win_rate).toBeNull();
    expect(v.speed_to_lead).toBeNull();
    expect(v.csat).toBeNull();
    expect(v.avg_deal).toBeNull();
  });

  it("nhóm gộp dữ liệu thô (tỉ lệ = tổng tử / tổng mẫu)", () => {
    const v = computeMetrics(f, ["Lan", "Minh"], span);
    expect(v.revenue).toBe(15_000_000);
    expect(v.win_rate).toBe(50); // 2 / 4, không phải trung bình (66,7 + 0) / 2
    expect(v.overdue_debt).toBe(4_000_000);
  });

  it("doanh thu theo giao dịch thắng khi chưa có phiếu thu", () => {
    expect(computeMetrics({ ...f, revenueSource: "deals" }, "Lan", span).revenue).toBe(10_000_000);
  });

  it("phễu, bản đồ nhiệt, chuỗi tuần", () => {
    const fn = funnel(f, "Lan", span);
    expect(fn.map((s) => s.value)).toEqual([4, 3, 0, 2]);
    expect(fn[1].conv).toBe(75);
    expect(fn[3].conv).toBeNull(); // bước trước = 0
    const hm = heatmap(f, "Lan", span);
    expect(hm).toHaveLength(7);
    expect(hm[0]).toHaveLength(24);
    // 4 cuộc gọi + 1 tin nhắn ngày thứ Hai lúc 1–4 giờ sáng VN
    expect(hm[0][1]).toBe(2);
    expect(hm.flat().reduce((s, x) => s + x, 0)).toBe(5);
    const s = weeklySeries(f, "Lan", "calls", [span, { from: span.to, to: span.to + 7 * D }]);
    expect(s).toEqual([4, 0]);
    expect(weeklySeries(f, "Lan", "stale_deals", [span])).toEqual([null]);
  });
});

describe("điểm hiệu suất, xếp hạng, điểm mạnh/yếu, cảnh báo", () => {
  const base = (o: Partial<Values>): Values => ({ ...(Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as Values), ...o });
  const values = {
    A: base({ revenue: 300, calls: 30, speed_to_lead: 5 }),
    B: base({ revenue: 200, calls: 20, speed_to_lead: 50 }),
    C: base({ revenue: 100, calls: 10, speed_to_lead: null }),
  };

  it("trọng số: lọc chỉ số lạ, rỗng → mặc định", () => {
    expect(normWeights({ revenue: 50, bogus: 10, calls: -1, csat: 500 })).toEqual({ revenue: 50, csat: 100 });
    expect(normWeights(null)).toEqual(SCORE_DEFAULT);
  });

  it("điểm = trung bình có trọng số bách phân vị, bỏ chỉ số thiếu khỏi mẫu số", () => {
    const { score, pct } = perfScores(values, { revenue: 50, speed_to_lead: 50 });
    expect(pct.A.revenue).toBe(83);
    expect(pct.A.speed_to_lead).toBe(75); // thấp hơn = tốt hơn
    expect(pct.C.speed_to_lead).toBeUndefined();
    expect(score.A).toBe(79);
    expect(score.C).toBe(17); // chỉ tính doanh thu
    const r = ranks(score);
    expect(r).toEqual({ A: 1, B: 2, C: 3 });
    expect(ranks({ X: 50, Y: 50, Z: null })).toEqual({ X: 1, Y: 1, Z: 3 });
    expect(perfScores({ X: base({}) }, { revenue: 1 }).score.X).toBeNull();
  });

  it("trung vị nhóm và điểm mạnh / cần cải thiện", () => {
    const med = medians(Object.values(values));
    expect(med.revenue).toBe(200);
    expect(med.speed_to_lead).toBe(27.5);
    const sw = strengthsWeaknesses(values.C, med);
    expect(sw.strengths).toEqual([]);
    expect(sw.weaknesses.map((x) => x.key)).toEqual(["revenue", "calls"]);
    const a = strengthsWeaknesses(values.A, med);
    expect(a.strengths.map((x) => x.key)).toEqual(["speed_to_lead", "revenue"]); // −82% thời gian = +82
  });

  it("cảnh báo tụt >20%, tồn đọng, speed-to-lead chậm", () => {
    const al = buildAlerts([
      { who: "A", cur: base({ revenue: 70, calls: 2, stale_deals: 0, speed_to_lead: 30 }), prev: base({ revenue: 100, calls: 2 }) },
      { who: "B", cur: base({ calls: 1, stale_deals: 3, speed_to_lead: 90 }), prev: base({ calls: 10 }) },
      { who: "C", cur: base({ calls: 1 }), prev: base({ calls: 2 }) }, // kỳ trước quá ít, không báo
    ]);
    expect(al.map((a) => `${a.who}:${a.kind}:${a.severity}`)).toEqual(["A:drop:warn", "B:drop:danger", "B:stale:danger", "B:slow_lead:warn"]);
  });

  it("điểm đánh giá từ chỉ số", () => {
    expect(metricReviewScore("task_ontime", 85, [])).toBe(85);
    expect(metricReviewScore("call_quality", 120, [])).toBe(100);
    expect(metricReviewScore("csat", 4.5, [])).toBe(90);
    expect(metricReviewScore("nps", -20, [])).toBe(40);
    expect(metricReviewScore("speed_to_lead", 5, [5, 50, 100])).toBe(83);
    expect(metricReviewScore("revenue", 100, [])).toBe(50);
    expect(metricReviewScore("revenue", null, [1])).toBeNull();
  });
});

describe("quyền xem", () => {
  const teams = [
    { id: "t1", name: "Kinh doanh", leader: "Minh", members: ["Lan", "Hà"], color: "#000000" },
    { id: "t2", name: "CSKH", leader: "Hà", members: ["Trang"], color: "#000000" },
  ];
  it("chủ/quản lý thấy tất cả", () => {
    const a = buildAccess("Chủ", "owner", teams);
    expect(a.scope).toBe("all");
    expect(a.canSeePerson("Trang")).toBe(true);
    expect(a.canConfigure).toBe(true);
    expect(buildAccess("QL", "manager", teams).canConfigure).toBe(false);
  });
  it("trưởng nhóm thấy đội mình, không thấy hoa hồng người khác", () => {
    const a = buildAccess("Minh", "member", teams);
    expect(a.scope).toBe("team");
    expect(a.visible(["Minh", "Lan", "Hà", "Trang"])).toEqual(["Minh", "Lan", "Hà"]);
    expect(a.canSeeTeam("t1")).toBe(true);
    expect(a.canSeeTeam("CSKH")).toBe(false);
    expect(a.canSeeCommissionOf("Lan")).toBe(false);
    expect(a.canReview).toBe(false);
  });
  it("nhân viên chỉ thấy mình", () => {
    const a = buildAccess("Lan", "member", teams);
    expect(a.scope).toBe("self");
    expect(a.visible(["Minh", "Lan"])).toEqual(["Lan"]);
    expect(a.canSeeCommissionOf("Lan")).toBe(true);
  });
});

describe("bản tin tuần", () => {
  it("dòng tóm tắt có so sánh tuần trước", () => {
    const cur = { revenue: 12_000_000, calls: 30, speed_to_lead: 15, won_deals: 2 } as Values;
    const prev = { revenue: 10_000_000, calls: 40, speed_to_lead: null, won_deals: 2 } as Values;
    expect(digestLine(cur, prev)).toBe("doanh thu 12 tr (+20%), giao dịch thắng 2 (=), cuộc gọi 30 (−25%), speed-to-lead 15 phút");
    expect(digestLine({ revenue: 0, calls: 90, speed_to_lead: 10, won_deals: 0 } as Values, { revenue: 0, calls: 10, speed_to_lead: 40, won_deals: 1 } as Values)).toBe("doanh thu 0 (=), giao dịch thắng 0 (−100%), cuộc gọi 90 (tăng gấp 9 lần), speed-to-lead 10 phút (nhanh hơn 75%)");
    expect(digestLine({ speed_to_lead: 300 } as Values, { speed_to_lead: 10 } as Values)).toBe("speed-to-lead 5 giờ (chậm hơn gấp 30 lần)");
  });
});

// Đảm bảo bộ dữ liệu rỗng không làm hỏng phép tính.
it("facts rỗng", () => {
  const v = computeMetrics(facts(), "X", span);
  expect(v.revenue).toBe(0);
  expect(funnel(facts(), "X", span).every((s) => s.value === 0)).toBe(true);
});
