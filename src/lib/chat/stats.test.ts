import { describe, expect, it } from "vitest";
import { computeInboxStats, hasPhone, resolveRange, sessionsOf, type SConv, type SMsg } from "./metrics";
import { ruleSentiment, maskPII, fold } from "./sentiment-rules";
import { callName, scoreConversation } from "./quality-rules";
import { mineOrUnassignedWhere, visibilityMode } from "./visibility";
import type { WorkingHours } from "./hours";

const TZ = "Asia/Ho_Chi_Minh";
const VN = (s: string) => Date.parse(`${s}+07:00`);
const ALL: WorkingHours = { tz: TZ, days: [] };
const WH: WorkingHours = { tz: TZ, days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "08:00", end: "21:00" })) };

const conv = (id: string, p: Partial<SConv> = {}): SConv => ({ id, pageId: "p1", channel: "messenger", kind: "inbox", assignee: "", tags: [], createdAt: VN("2026-11-05T09:00:00"), status: "open", quality: null, lastInAt: null, lastOutAt: null, ...p });
const m = (c: string, d: string, at: string, a = "", k = "message"): SMsg => ({ c, d, k, a, t: VN(at) });

describe("phiên trả lời", () => {
  it("nhiều tin khách liên tiếp + một tin trả lời = một phiên, tính từ tin đầu", () => {
    const s = sessionsOf([m("c", "in", "2026-11-05T09:00:00"), m("c", "in", "2026-11-05T09:02:00"), m("c", "out", "2026-11-05T09:05:00", "An"), m("c", "out", "2026-11-05T09:06:00", "An"), m("c", "in", "2026-11-05T10:00:00"), m("c", "out", "2026-11-05T10:01:00", "Bình")], ALL);
    expect(s.map((x) => [x.author, x.ms / 60e3, x.first])).toEqual([["An", 5, true], ["Bình", 1, false]]);
  });
  it("thời gian chờ chỉ tính trong giờ làm việc", () => {
    const s = sessionsOf([m("c", "in", "2026-11-05T20:55:00"), m("c", "out", "2026-11-06T08:10:00", "An")], WH);
    expect(s[0].ms).toBe(15 * 60e3);
  });
});

describe("computeInboxStats", () => {
  const from = VN("2026-11-05T00:00:00");
  const to = VN("2026-11-07T00:00:00");
  const convs = [
    conv("a", { assignee: "An", tags: ["vip"], quality: 80, lastInAt: VN("2026-11-05T09:00:00"), lastOutAt: VN("2026-11-05T09:04:00") }),
    conv("b", { assignee: "Bình", kind: "comment", pageId: "p2", tags: ["vip", "hoi-gia"], createdAt: VN("2026-11-06T10:00:00"), quality: 60, lastInAt: VN("2026-11-06T11:00:00"), lastOutAt: VN("2026-11-06T10:10:00") }),
    conv("old", { assignee: "An", createdAt: VN("2026-10-01T10:00:00"), lastInAt: VN("2026-11-05T15:00:00"), lastOutAt: VN("2026-11-05T15:30:00") }),
  ];
  const msgs = [
    m("a", "in", "2026-11-05T09:00:00"),
    m("a", "out", "2026-11-05T09:04:00", "An"),
    m("old", "in", "2026-11-05T15:00:00"),
    m("old", "out", "2026-11-05T15:30:00", "An"),
    m("b", "in", "2026-11-06T10:00:00", "", "comment"),
    m("b", "out", "2026-11-06T10:10:00", "Bình", "comment"),
    m("b", "in", "2026-11-06T11:00:00"),
    m("b", "note", "2026-11-06T11:01:00", "Bình"),
    m("b", "out", "2026-11-04T10:00:00", "Bot"), // ngoài khoảng, tác giả không hợp lệ
  ].sort((x, y) => x.t - y.t);
  const s = computeInboxStats({ convs, msgs, phoneFirstAt: new Map([["a", VN("2026-11-05T09:00:00")], ["old", 0]]), from, to, wh: ALL, validStaff: ["An", "Bình"] });

  it("tổng quan", () => {
    expect(s.overview).toMatchObject({ newConvs: 2, activeConvs: 3, inMsgs: 3, outMsgs: 2, comments: 1, commentReplies: 1, phones: 1, convWithPhone: 2, unanswered: 1, sessions: 3 });
    expect(s.overview.medianFirstResponseMs).toBe(7 * 60e3); // a: 4 phút, b: 10 phút
    expect(s.overview.phoneRate).toBeCloseTo(2 / 3);
  });
  it("theo ngày", () => {
    expect(s.daily.map((d) => d.day)).toEqual(["2026-11-05", "2026-11-06"]);
    expect(s.daily[0]).toMatchObject({ newConvs: 1, inMsgs: 2, outMsgs: 2, phones: 1 });
    expect(s.daily[1]).toMatchObject({ newConvs: 1, comments: 1, inMsgs: 1 });
  });
  it("theo nhân viên", () => {
    const an = s.byStaff.find((x) => x.name === "An")!;
    const binh = s.byStaff.find((x) => x.name === "Bình")!;
    expect(an).toMatchObject({ sent: 2, sessions: 2, phones: 1, convs: 2, quality: 80 });
    expect(an.medianResponseMs).toBe(17 * 60e3);
    expect(binh).toMatchObject({ sent: 0, commentReplies: 1, sessions: 1, convs: 1, quality: 60 });
    expect(s.byStaff.some((x) => x.name === "Bot")).toBe(false);
    expect(s.fastest.map((x) => x.name)).toEqual(["Bình", "An"]);
  });
  it("theo trang, thẻ, bản đồ nhiệt", () => {
    expect(s.byPage.find((p) => p.pageId === "p2")).toMatchObject({ newConvs: 1, comments: 1, inMsgs: 1 });
    expect(s.tags[0]).toEqual({ tag: "vip", count: 2, newCount: 2 });
    expect(s.tagDaily[1].counts.vip).toBe(1);
    expect(s.heatmap[4][9]).toBe(1); // thứ năm 9h
    expect(s.heatmap.flat().reduce((a, b) => a + b, 0)).toBe(4);
  });
  it("chỉ giữ dòng của chính mình", () => {
    const mine = computeInboxStats({ convs, msgs, phoneFirstAt: new Map(), from, to, wh: ALL, staffNames: ["Bình"] });
    expect(mine.byStaff.map((x) => x.name)).toEqual(["Bình"]);
  });
});

describe("khoảng thời gian", () => {
  const now = VN("2026-11-06T15:00:00");
  it("hôm nay / 7 ngày / tháng theo giờ VN", () => {
    expect(resolveRange("today", null, null, now, TZ)).toMatchObject({ from: VN("2026-11-06T00:00:00"), to: VN("2026-11-07T00:00:00") });
    expect(resolveRange("7d", null, null, now, TZ)).toMatchObject({ fromDay: "2026-10-31", toDay: "2026-11-06" });
    expect(resolveRange("month", null, null, now, TZ).fromDay).toBe("2026-11-01");
  });
  it("tùy chọn: đảo ngày, giới hạn 366 ngày, sai → 7 ngày", () => {
    expect(resolveRange("custom", "2026-11-05", "2026-11-01", now, TZ)).toMatchObject({ fromDay: "2026-11-01", toDay: "2026-11-05" });
    expect(resolveRange("custom", "2020-01-01", "2026-11-05", now, TZ).fromDay).toBe("2025-11-05");
    expect(resolveRange("custom", "abc", "", now, TZ).preset).toBe("7d");
  });
});

describe("SĐT", () => {
  it("nhận số di động VN", () => {
    expect(hasPhone("sdt em 0912 345 678 nha")).toBe(true);
    expect(hasPhone("+84912345678")).toBe(true);
    expect(hasPhone("mã đơn 12345")).toBe(false);
  });
  it("che SĐT / email trước khi gửi AI", () => {
    expect(maskPII("gọi 0912.345.678 hoặc mail a.b@gmail.com")).toBe("gọi [sđt] hoặc mail [email]");
  });
});

describe("cảm xúc", () => {
  const L = (s: string) => ruleSentiment(s).label;
  it("tiêu cực có dấu và không dấu", () => {
    for (const s of ["Shop lừa đảo à", "lua dao", "Tôi rất thất vọng", "that vong qua", "Hàng tệ quá", "bực mình ghê", "Hoàn tiền cho tôi", "hoan tien di", "không hài lòng", "ko hai long", "tôi sẽ báo công an", "bao cong an", "chửi khách à"]) expect(L(s), s).toBe("negative");
  });
  it("tích cực", () => {
    for (const s of ["Cảm ơn shop nhiều", "cam on shop", "Tuyệt vời", "rất hài lòng", "hai long lam"]) expect(L(s), s).toBe("positive");
  });
  it("trung tính và phủ định", () => {
    expect(L("Giá bao nhiêu vậy shop")).toBe("neutral");
    expect(L("hàng không tệ")).toBe("neutral");
    expect(L("Cảm ơn nhưng hàng bị lỗi, hoàn tiền giúp")).toBe("negative");
    expect(L("te qua")).toBe("negative");
    expect(L("tê chân quá")).toBe("neutral"); // có dấu: "tê" khác "tệ"
  });
  it("fold bỏ dấu", () => {
    expect(fold("Đặt Hàng Nhé!")).toBe("dat hang nhe!");
  });
});

describe("chất lượng", () => {
  it("chăm sóc tốt được 100", () => {
    const r = scoreConversation({ name: "Nguyễn Lan", status: "done", sentiment: "" }, [
      { direction: "in", text: "Giá bao nhiêu?", createdAt: VN("2026-11-05T09:00:00") },
      { direction: "out", text: "Dạ chào chị Lan, giá 200k ạ", createdAt: VN("2026-11-05T09:02:00") },
      { direction: "in", text: "ok", createdAt: VN("2026-11-05T09:03:00") },
      { direction: "out", text: "Cảm ơn chị ạ", createdAt: VN("2026-11-05T09:04:00") },
    ], WH);
    expect(r.score).toBe(100);
    expect(r.firstResponseMs).toBe(2 * 60e3);
  });
  it("trừ điểm: chậm, bỏ sót câu hỏi, không chào, không tên, tiêu cực chưa xử lý", () => {
    const r = scoreConversation({ name: "Trần Minh", status: "open", sentiment: "negative" }, [
      { direction: "in", text: "Còn hàng không?", createdAt: VN("2026-11-05T09:00:00") },
      { direction: "out", text: "còn", createdAt: VN("2026-11-05T10:30:00") },
      { direction: "in", text: "ship bao lâu?", createdAt: VN("2026-11-05T10:31:00") },
    ], WH);
    expect(r.items.map((i) => i.key).sort()).toEqual(["closing", "greeting", "name", "negative", "open", "slow", "unanswered"].sort());
    expect(r.score).toBe(100 - 25 - 8 - 5 - 5 - 5 - 10 - 15);
  });
  it("không trả lời → −40", () => {
    expect(scoreConversation({ name: "", status: "open", sentiment: "" }, [{ direction: "in", text: "alo", createdAt: 0 }], WH).score).toBe(60);
  });
  it("tên gọi", () => {
    expect(callName("Nguyễn Thị Lan")).toBe("lan");
    expect(callName("Khách")).toBe("");
  });
});

describe("ai thấy hội thoại nào", () => {
  it("chủ / có quyền xem mọi hội thoại → theo phạm vi; nhân viên + bật chỉ của mình → mine", () => {
    expect(visibilityMode({ isOwner: true, viewAll: false, membersSeeOnlyMine: true })).toBe("scope");
    expect(visibilityMode({ isOwner: false, viewAll: true, membersSeeOnlyMine: true })).toBe("scope");
    expect(visibilityMode({ isOwner: false, viewAll: false, membersSeeOnlyMine: true })).toBe("mine");
    expect(visibilityMode({ isOwner: false, viewAll: false, membersSeeOnlyMine: false })).toBe("scope");
  });
  it("điều kiện của tôi + chưa giao (ẩn khách ngoài phạm vi)", () => {
    expect(mineOrUnassignedWhere("w", "Lan", [])).toEqual({ workspaceId: "w", OR: [{ assignee: "Lan" }, { assignee: "" }] });
    expect(mineOrUnassignedWhere("w", "Lan", ["r1"])).toEqual({ workspaceId: "w", OR: [{ assignee: "Lan" }, { assignee: "", OR: [{ recordId: null }, { recordId: { notIn: ["r1"] } }] }] });
  });
});
