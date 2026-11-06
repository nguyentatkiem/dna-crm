import { describe, expect, it } from "vitest";
import { findDuplicateGroups, groupKey, mergeData, normEmail, normName, normPhoneVN, pickSurvivor } from "./dedupe";
import { SCORING_DEFAULT, computeScore, normalizeRules, scoreParts, EVENT_CAP } from "./scoring";
import { computeRfm, quintile, segmentOf, summarizeRfm } from "./rfm";
import { mergeTimeline, parseCursor, type TimelineItem } from "./kinds";

describe("chuẩn hoá", () => {
  it("SĐT", () => {
    expect(normPhoneVN("+84 912.345.678")).toBe("0912345678");
    expect(normPhoneVN("0912 345 678")).toBe("0912345678");
    expect(normPhoneVN("84912345678")).toBe("0912345678");
    expect(normPhoneVN("912345678")).toBe("0912345678");
    expect(normPhoneVN("123")).toBe("");
  });
  it("email và tên", () => {
    expect(normEmail("  An.Nguyen@Email.VN ")).toBe("an.nguyen@email.vn");
    expect(normEmail("khong-phai-email")).toBe("");
    expect(normName("Nguyễn  Thị Ánh-Đào")).toBe("nguyen thi anh dao");
  });
});

describe("findDuplicateGroups", () => {
  const rows = [
    { id: "a", title: "Nguyễn Văn A", phone: "0912 345 678" },
    { id: "b", title: "Anh A", phone: "+84912345678" },
    { id: "c", title: "Chị C", email: "C@x.vn" },
    { id: "d", title: "C khác", email: "c@x.vn " },
    { id: "e", title: "Trần Bình", phone: "0988111222" },
    { id: "f", title: "tran binh", phone: "0388111222" },
    { id: "g", title: "Người lạ", phone: "0900000001" },
  ];
  it("gom đúng nhóm và lý do", () => {
    const g = findDuplicateGroups(rows);
    expect(g.map((x) => x.key).sort()).toEqual(["a,b", "c,d", "e,f"]);
    expect(g.find((x) => x.key === "a,b")!.reasons[0]).toContain("0912345678");
    expect(g.find((x) => x.key === "e,f")!.reasons[0]).toContain("tran binh");
  });
  it("nối bắc cầu và bỏ nhóm đã đánh dấu không trùng", () => {
    const g = findDuplicateGroups([...rows, { id: "h", title: "X", phone: "0912345678", email: "c@x.vn" }]);
    expect(g[0].ids.sort()).toEqual(["a", "b", "c", "d", "h"]);
    expect(findDuplicateGroups(rows, [groupKey(["b", "a"])]).map((x) => x.key)).not.toContain("a,b");
  });
});

describe("mergeData / pickSurvivor", () => {
  it("điền ô trống, nối thẻ và mảng, giữ giá trị chính", () => {
    const out = mergeData({ sdt: "0912", note: "A", tags: "VIP", list: [1] }, [{ sdt: "0999", email: "a@b.vn", note: "B", tags: "VIP, Spa", list: [1, 2] }], { note: "longtext", tags: "tags" });
    expect(out).toEqual({ sdt: "0912", email: "a@b.vn", note: "A\n— B", tags: "VIP, Spa", list: [1, 2] });
  });
  it("chọn hồ sơ nhiều dữ liệu nhất", () => {
    expect(pickSurvivor([{ id: "x", data: { a: 1 } }, { id: "y", data: { a: 1, b: 2 } }])!.id).toBe("y");
  });
});

describe("computeScore", () => {
  const R = SCORING_DEFAULT;
  it("nền hồ sơ theo trọng số", () => {
    expect(computeScore(50, {}, 0, R)).toBe(30);
  });
  it("cộng hành vi, chặn theo loại và 0–100", () => {
    expect(computeScore(50, { order_done: 2, email_open: 3 }, 0, R)).toBe(30 + 30 + 6);
    expect(scoreParts(50, { email_click: 100 }, 0, R).parts[0].points).toBe(EVENT_CAP);
    expect(computeScore(100, { order_done: 9, call_positive: 9, form_submit: 9 }, 0, R)).toBe(100);
    expect(computeScore(10, { survey_detractor: 5 }, 0, R)).toBe(0);
  });
  it("trừ theo tuần không tương tác", () => {
    expect(computeScore(50, {}, 21, R)).toBe(24);
    expect(computeScore(50, {}, 6, R)).toBe(30);
  });
  it("tắt chấm điểm hành vi thì giữ điểm hồ sơ", () => {
    expect(computeScore(57, { order_done: 3 }, 100, { ...R, enabled: false })).toBe(57);
  });
  it("normalizeRules chặn giá trị lạ", () => {
    const r = normalizeRules({ profileWeight: 150, windowDays: 1, events: { order_done: 999 } as never });
    expect(r.profileWeight).toBe(100);
    expect(r.windowDays).toBe(7);
    expect(r.events.order_done).toBe(50);
    expect(r.events.email_open).toBe(2);
  });
});

describe("RFM", () => {
  it("quintile", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quintile(s, 1)).toBe(1);
    expect(quintile(s, 10)).toBe(5);
    expect(quintile(s, 5)).toBe(3);
    expect(quintile([2, 2, 2], 2)).toBe(3);
  });
  it("segmentOf", () => {
    expect(segmentOf(5, 5, 5)).toBe("vip");
    expect(segmentOf(5, 1, 2, 1)).toBe("new");
    expect(segmentOf(3, 4, 4)).toBe("loyal");
    expect(segmentOf(4, 2, 3, 2)).toBe("potential");
    expect(segmentOf(3, 2, 2)).toBe("attention");
    expect(segmentOf(1, 5, 5)).toBe("at_risk");
    expect(segmentOf(2, 1, 2)).toBe("sleeping");
    expect(segmentOf(1, 1, 1)).toBe("hibernating");
  });
  it("computeRfm + summarizeRfm", () => {
    const now = new Date("2026-11-01T00:00:00Z").getTime();
    const d = (days: number) => now - days * 864e5;
    const custs = [
      { id: "vip", orders: [d(2), d(20), d(40), d(60), d(80)].map((at) => ({ at, total: 5e6 })) },
      { id: "new", orders: [{ at: d(1), total: 3e5 }] },
      { id: "risk", orders: [d(300), d(310), d(320), d(330)].map((at) => ({ at, total: 4e6 })) },
      { id: "mid", orders: [d(100), d(120)].map((at) => ({ at, total: 1e6 })) },
      { id: "low", orders: [{ at: d(200), total: 2e5 }] },
      { id: "old", orders: [{ at: d(500), total: 9e6 }] },
      { id: "none", orders: [] },
    ];
    const rows = computeRfm(custs, now, 12);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.none).toBeUndefined();
    expect(by.vip.segment).toBe("vip");
    expect(by.new.segment).toBe("new");
    expect(by.risk.segment).toBe("at_risk");
    expect(by.old.segment).toBe("hibernating");
    expect(by.vip.frequency).toBe(5);
    const sum = summarizeRfm(rows);
    expect(sum.reduce((s, x) => s + x.count, 0)).toBe(6);
    expect(sum.find((x) => x.key === "vip")!.share).toBeGreaterThan(0.5);
  });
});

describe("mergeTimeline", () => {
  const it_ = (id: string, at: string): TimelineItem => ({ id, at, kind: "note", icon: "edit", title: id });
  const T = "2026-11-05T04:42:00.000Z";
  // 5 mục, 3 mục cùng thời điểm T nằm vắt ngang ranh giới trang 2 mục.
  const lists = [[it_("a", "2026-11-06T00:00:00.000Z"), it_("c", T)], [it_("b", T), it_("d", T)], [it_("e", "2026-11-01T00:00:00.000Z")]];
  it("phân trang không mất/lặp mục cùng thời điểm", () => {
    const seen: string[] = [];
    let next: string | null | undefined;
    for (let i = 0; i < 5; i++) {
      const p = mergeTimeline(lists, 2, next);
      seen.push(...p.items.map((x) => x.id));
      next = p.next;
      if (!next) break;
    }
    expect(seen).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("con trỏ cũ (chỉ có ngày) vẫn dùng được", () => {
    expect(parseCursor(T)).toEqual({ at: Date.parse(T), id: "" });
    expect(parseCursor("rác")).toBeNull();
    expect(mergeTimeline(lists, 10, T).items.map((x) => x.id)).toEqual(["e"]);
  });
});
