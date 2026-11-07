import { describe, expect, it } from "vitest";
import { canModify, dmMembers, extractRefs, isUnread, matchesSearch, mergeRefs, parseRefMeta, shouldNotifyDm, threadTitle, unreadCount, withRead } from "./shared";
import { mentionTargets } from "./rules";

describe("chưa đọc / đã đọc", () => {
  const msgs = [
    { userId: "a", readByJson: '["a"]' },
    { userId: "a", readByJson: '["a","b"]' },
    { userId: "b", readByJson: '["b"]' },
    { userId: "a", readByJson: '["a"]', refJson: '{"refs":[],"deleted":true}' },
    { userId: "c", readByJson: "rác" },
  ];
  it("đếm tin của người khác chưa có mình trong readBy, bỏ tin thu hồi", () => {
    expect(unreadCount(msgs, "b")).toBe(2);
    expect(unreadCount(msgs, "a")).toBe(2);
    expect(isUnread(msgs[2], "b")).toBe(false);
  });
  it("withRead thêm một lần", () => {
    expect(withRead('["a"]', "b")).toBe('["a","b"]');
    expect(withRead('["a","b"]', "b")).toBeNull();
  });
});

describe("sửa / thu hồi trong 15 phút", () => {
  const now = Date.parse("2026-11-07T10:00:00Z");
  it("chỉ tin của mình, trong 15 phút, chưa thu hồi", () => {
    expect(canModify({ userId: "a", createdAt: new Date(now - 14 * 60e3) }, "a", now)).toBe(true);
    expect(canModify({ userId: "a", createdAt: new Date(now - 16 * 60e3) }, "a", now)).toBe(false);
    expect(canModify({ userId: "a", createdAt: new Date(now) }, "b", now)).toBe(false);
    expect(canModify({ userId: "a", createdAt: new Date(now), refJson: '{"deleted":true}' }, "a", now)).toBe(false);
  });
});

describe("link CRM trong tin", () => {
  it("nhận link khách, đơn, phiếu, việc (URL đầy đủ hoặc đường dẫn)", () => {
    const refs = extractRefs("xem https://crm.vn/w/b/contacts?open=rec1 và /w/orders/ord_2, /w/tickets/t3 cả /w/my-work?task=tk4 nữa; /w/orders/new bỏ qua");
    expect(refs).toEqual([
      { kind: "record", id: "rec1" },
      { kind: "order", id: "ord_2" },
      { kind: "ticket", id: "t3" },
      { kind: "task", id: "tk4" },
    ]);
  });
  it("bỏ id lạ, không trùng, tối đa 5", () => {
    expect(extractRefs("/w/orders/<script>")).toEqual([]);
    expect(mergeRefs([{ kind: "order", id: "x" }], [{ kind: "order", id: "x" }, { kind: "task", id: "y" }])).toHaveLength(2);
    expect(mergeRefs(Array.from({ length: 8 }, (_, i) => ({ kind: "task" as const, id: `t${i}` })), [])).toHaveLength(5);
  });
  it("refJson hỏng hoặc kiểu lạ bị lọc", () => {
    expect(parseRefMeta('{"refs":[{"kind":"user","id":"x"},{"kind":"order","id":"o1"}],"edited":true}')).toEqual({ refs: [{ kind: "order", id: "o1" }], edited: true });
    expect(parseRefMeta("{")).toEqual({ refs: [] });
  });
});

describe("@nhắc trong hội thoại", () => {
  const members = [
    { id: "u1", name: "Minh" },
    { id: "u2", name: "Minh Đức" },
    { id: "u3", name: "Thu Trang" },
  ];
  it("dùng lại findMentions: ưu tiên tên dài, bỏ người viết", () => {
    expect(mentionTargets("@Minh Đức xem giúp", members, "u3").map((m) => m.id)).toEqual(["u2"]);
    expect(mentionTargets("@Thu Trang ơi", members, "u3")).toEqual([]);
  });
  it("chỉ báo thành viên của hội thoại; @all báo cả nhóm", () => {
    expect(mentionTargets("@Người Ngoài", members, "u1")).toEqual([]);
    expect(mentionTargets("@all họp 3h", members, "u1").map((m) => m.id)).toEqual(["u2", "u3"]);
  });
});

describe("khác", () => {
  it("giãn báo DM 2 phút", () => {
    const now = Date.now();
    expect(shouldNotifyDm(null, now)).toBe(true);
    expect(shouldNotifyDm(new Date(now - 60e3), now)).toBe(false);
    expect(shouldNotifyDm(new Date(now - 121e3), now)).toBe(true);
  });
  it("tên hội thoại & cặp DM ổn định", () => {
    const names = new Map([["a", "An"], ["b", "Bình"]]);
    expect(threadTitle({ kind: "dm", name: "", membersJson: '["a","b"]' }, "a", names)).toBe("Bình");
    expect(threadTitle({ kind: "group", name: "Cả đội", membersJson: "[]" }, "a", names)).toBe("Cả đội");
    expect(dmMembers("b", "a")).toEqual(["a", "b"]);
  });
  it("tìm không dấu", () => {
    expect(matchesSearch("Khách đã chuyển khoản", "chuyen khoan")).toBe(true);
    expect(matchesSearch("abc", " ")).toBe(false);
  });
});
