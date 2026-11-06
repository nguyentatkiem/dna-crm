import { describe, expect, it } from "vitest";
import { cleanAnswers, npsBreakdown, npsBucket, npsScore, questionStats, weekKey, weeklyTrend, type Question } from "./shared";

describe("NPS", () => {
  it("phân nhóm theo điểm", () => {
    expect([0, 6, 7, 8, 9, 10].map(npsBucket)).toEqual(["detractor", "detractor", "passive", "passive", "promoter", "promoter"]);
  });
  it("điểm NPS = %ủng hộ − %phản đối", () => {
    expect(npsScore([])).toBeNull();
    expect(npsScore([10, 10, 10])).toBe(100);
    expect(npsScore([0, 3, 6])).toBe(-100);
    expect(npsScore([9, 10, 7, 8, 3])).toBe(20); // 2 ủng hộ, 1 phản đối / 5
    expect(npsScore([9, 7, 7])).toBe(33);
    expect(npsScore([9, 11, -1, NaN])).toBe(100); // bỏ điểm lỗi
  });
  it("phân bố điểm", () => {
    const b = npsBreakdown([10, 10, 8, 2]);
    expect(b.dist[10]).toBe(2);
    expect(b).toMatchObject({ promoter: 2, passive: 1, detractor: 1, total: 4 });
  });
  it("xu hướng theo tuần", () => {
    const now = new Date(2026, 10, 6); // thứ sáu
    const rows = [{ at: new Date(2026, 10, 3), nps: 10 }, { at: new Date(2026, 10, 4), nps: 2 }, { at: new Date(2026, 9, 28), nps: 9 }];
    const t = weeklyTrend(rows, 3, now);
    expect(t).toHaveLength(3);
    expect(t[2]).toMatchObject({ week: weekKey(now), count: 2, nps: 0 });
    expect(t[1]).toMatchObject({ count: 1, nps: 100 });
    expect(t[0].nps).toBeNull();
    expect(weekKey(new Date(2026, 10, 8))).toBe("2026-11-02"); // chủ nhật thuộc tuần bắt đầu thứ hai
  });
});

const Q: Question[] = [
  { id: "a", type: "nps", label: "NPS", required: true },
  { id: "b", type: "rating", label: "Sao" },
  { id: "c", type: "choice", label: "Chọn", options: ["X", "Y"] },
  { id: "d", type: "multi", label: "Nhiều", options: ["X", "Y", "Z"] },
  { id: "e", type: "text", label: "Góp ý" },
];

describe("cleanAnswers", () => {
  it("bắt câu bắt buộc", () => {
    expect(cleanAnswers(Q, {})).toEqual({ error: "Vui lòng trả lời: “NPS”" });
  });
  it("kiểm tra khoảng điểm và lựa chọn", () => {
    expect("error" in cleanAnswers(Q, { a: 11 })).toBe(true);
    expect("error" in cleanAnswers(Q, { a: 5, b: 0 })).toBe(true);
    expect("error" in cleanAnswers(Q, { a: 5, c: "Q" })).toBe(true);
  });
  it("làm sạch và rút nps/rating/comment", () => {
    const r = cleanAnswers(Q, { a: "9", b: 4, c: "Y", d: ["X", "X", "W"], e: "  Tốt lắm  ", zz: "bỏ" });
    expect(r).toEqual({ answers: { a: 9, b: 4, c: "Y", d: ["X"], e: "Tốt lắm" }, nps: 9, rating: 4, comment: "Tốt lắm" });
  });
});

describe("questionStats", () => {
  it("đếm lựa chọn và trung bình sao", () => {
    const s = questionStats(Q, [{ a: 9, b: 5, c: "X", d: ["X", "Y"] }, { a: 3, b: 3, c: "X", d: ["Y"] }]);
    expect(s[1]).toMatchObject({ answered: 2, avg: 4 });
    expect(s[2].options).toEqual([{ label: "X", count: 2 }, { label: "Y", count: 0 }]);
    expect(s[3].options).toEqual([{ label: "X", count: 1 }, { label: "Y", count: 2 }, { label: "Z", count: 0 }]);
  });
});
