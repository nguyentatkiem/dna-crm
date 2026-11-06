import { describe, expect, it } from "vitest";
import { canDeletePost, normChannel, parseReactions, sortPosts, toggleReaction } from "@/lib/feed";

describe("Bảng tin", () => {
  it("bật/tắt cảm xúc, bỏ khoá rỗng", () => {
    let r = toggleReaction({}, "👍", "Lan");
    expect(r).toEqual({ "👍": ["Lan"] });
    r = toggleReaction(r, "👍", "Minh");
    expect(r["👍"]).toEqual(["Lan", "Minh"]);
    r = toggleReaction(r, "👍", "Lan");
    expect(r).toEqual({ "👍": ["Minh"] });
    expect(toggleReaction(r, "👍", "Minh")).toEqual({});
  });

  it("đọc reactionsJson an toàn, bỏ emoji lạ", () => {
    expect(parseReactions('{"👍":["Lan"],"🤡":["X"]}')).toEqual({ "👍": ["Lan"] });
    expect(parseReactions("hỏng")).toEqual({});
  });

  it("chuẩn hoá tên kênh", () => {
    expect(normChannel("  #Telesales  Miền Bắc ")).toBe("telesales miền bắc");
    expect(normChannel("")).toBe("chung");
    expect(normChannel(null)).toBe("chung");
  });

  it("quyền xoá và thứ tự ghim", () => {
    expect(canDeletePost("Lan", "Lan", false)).toBe(true);
    expect(canDeletePost("Lan", "Minh", false)).toBe(false);
    expect(canDeletePost("Lan", "Minh", true)).toBe(true);
    const s = sortPosts([
      { id: "a", pinned: false, createdAt: "2026-11-05T00:00:00Z" },
      { id: "b", pinned: true, createdAt: "2026-11-01T00:00:00Z" },
      { id: "c", pinned: false, createdAt: "2026-11-06T00:00:00Z" },
    ]);
    expect(s.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});
