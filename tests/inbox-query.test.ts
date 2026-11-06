import { describe, expect, it } from "vitest";
import { activeFilterCount, buildInboxWhere, caseVariants, DEFAULT_QUERY, inboxOrderBy, isWaiting, parseInboxQuery, toSearchParams, waitLabel, waitLevel, type FieldRefs } from "@/lib/inbox-query";
import { splitPhones } from "@/lib/inbox-text";

const fields = { lastInAt: "REF:lastInAt", readAt: "REF:readAt" } as unknown as FieldRefs;
const build = (qs: string, live: string[] = []) => buildInboxWhere(parseInboxQuery(new URLSearchParams(qs), "Lan"), { fields, livePostIds: live });

describe("parseInboxQuery", () => {
  it("mặc định: đang mở, mới nhất, không lọc mảng rỗng", () => {
    const q = parseInboxQuery(new URLSearchParams(""));
    expect(q).toEqual(DEFAULT_QUERY);
    expect(q.tags).toEqual([]);
    expect(q.assignees).toEqual([]);
  });
  it("bỏ giá trị lạ, giới hạn limit, '-' = chưa giao", () => {
    const q = parseInboxQuery(new URLSearchParams("kind=abc&status=xx&limit=99999&assignees=Lan,-,Lan&from=2026-13"));
    expect(q.kind).toBe("");
    expect(q.status).toBe("open");
    expect(q.limit).toBe(500);
    expect(q.assignees).toEqual(["Lan", ""]);
    expect(q.from).toBe("");
  });
  it("nhận tham số cũ ?filter=", () => {
    expect(parseInboxQuery(new URLSearchParams("filter=mine"), "Lan").assignees).toEqual(["Lan"]);
    expect(parseInboxQuery(new URLSearchParams("filter=done")).status).toBe("done");
    expect(parseInboxQuery(new URLSearchParams("filter=unread")).read).toBe("unread");
  });
  it("toSearchParams ↔ parse giữ nguyên", () => {
    const q = { ...DEFAULT_QUERY, kind: "comment" as const, tags: ["vip", "hot"], notTags: ["spam"], assignees: ["", "Lan"], orderMarked: true, status: "all" as const, q: "0912" };
    const back = parseInboxQuery(toSearchParams(q));
    expect(back).toEqual(q);
    expect(toSearchParams(DEFAULT_QUERY).toString()).toBe("");
  });
  it("đếm bộ lọc nâng cao", () => {
    expect(activeFilterCount(DEFAULT_QUERY)).toBe(0);
    expect(activeFilterCount(parseInboxQuery(new URLSearchParams("read=unread&tags=a&notTags=b&phone=has")))).toBe(3);
  });
});

describe("buildInboxWhere", () => {
  it("mặc định chỉ lọc hội thoại đang mở", () => {
    expect(build("")).toEqual([{ status: { not: "done" } }]);
    expect(build("status=all")).toEqual([]);
  });
  it("chưa trả lời / đã đọc chưa trả lời dùng so sánh cột", () => {
    const unrep = { lastInAt: { not: null }, OR: [{ lastOutAt: null }, { lastOutAt: { lt: fields.lastInAt } }] };
    expect(build("status=all&read=unreplied")).toEqual([unrep]);
    expect(build("status=all&read=read_unreplied")).toEqual([unrep, { readAt: { gt: fields.lastInAt } }]);
    expect(build("status=all&read=unread")).toEqual([{ unread: { gt: 0 } }]);
  });
  it("thẻ: có một / có tất cả / loại trừ", () => {
    expect(build("status=all&tags=a,b")).toEqual([{ OR: [{ tagsJson: { contains: '"a"' } }, { tagsJson: { contains: '"b"' } }] }]);
    expect(build("status=all&tags=a,b&tagMode=all")).toEqual([{ AND: [{ tagsJson: { contains: '"a"' } }, { tagsJson: { contains: '"b"' } }] }]);
    expect(build("status=all&notTags=spam")).toEqual([{ NOT: { tagsJson: { contains: '"spam"' } } }]);
  });
  it("SĐT, người phụ trách, nguồn, bài viết (một hoặc gộp nhiều bài)", () => {
    expect(build("status=all&phone=has")).toEqual([{ phones: { not: "" } }]);
    expect(build("status=all&phone=none")).toEqual([{ phones: "" }]);
    expect(build("status=all&assignees=-,Lan")).toEqual([{ assignee: { in: ["", "Lan"] } }]);
    expect(build("status=all&source=ad")).toEqual([{ source: "ad" }]);
    expect(build("status=all&post=p1")).toEqual([{ postId: "p1" }]);
    expect(build("status=all&post=p1,p2")).toEqual([{ postId: { in: ["p1", "p2"] } }]);
  });
  it("khoảng ngày theo giờ Việt Nam, theo ngày tạo hoặc cập nhật", () => {
    const [w] = build("status=all&from=2026-11-01&to=2026-11-06&dateField=created");
    expect(w).toEqual({ createdAt: { gte: new Date("2026-10-31T17:00:00.000Z"), lte: new Date("2026-11-06T16:59:59.999Z") } });
    expect(Object.keys(build("status=all&from=2026-11-01")[0])).toEqual(["lastAt"]);
  });
  it("bình luận: chưa nhắn riêng, đánh dấu đơn, livestream", () => {
    expect(build("status=all&privateReplied=no")).toEqual([{ kind: "comment", privateReplied: false }]);
    expect(build("status=all&orderMarked=1")).toEqual([{ orderMarked: true }]);
    expect(build("status=all&live=live", ["x"])).toEqual([{ kind: "comment", postId: { in: ["x"] } }]);
    expect(build("status=all&live=notlive", ["x"])).toEqual([{ kind: "comment", postId: { notIn: ["x"] } }]);
  });
  it("tìm kiếm: tên/nội dung, có số thì khớp 9 số cuối", () => {
    const [w] = build("status=all&q=0912 345 678");
    const or = (w as { OR: unknown[] }).OR;
    expect(or).toContainEqual({ phones: { contains: "912345678" } });
    expect(or).toContainEqual({ name: { contains: "0912 345 678" } });
    // "Lan", "lan", "LAN" × (tên, tin cuối, nội dung tin)
    expect((build("status=all&q=Lan")[0] as { OR: unknown[] }).OR).toHaveLength(9);
  });
  it("tìm kiếm: chữ thường có dấu vẫn khớp tên viết hoa (SQLite chỉ bỏ qua hoa/thường với ASCII)", () => {
    const or = (build("status=all&q=đỗ khánh vy")[0] as { OR: unknown[] }).OR;
    expect(or).toContainEqual({ name: { contains: "Đỗ Khánh Vy" } });
    expect(caseVariants("ĐẶNG")).toEqual(["ĐẶNG", "đặng", "Đặng"]);
  });
  it("tab, trang, kênh ghép AND", () => {
    expect(build("kind=comment&page=pg1&channel=messenger")).toEqual([{ kind: "comment" }, { pageId: "pg1" }, { channel: "messenger" }, { status: { not: "done" } }]);
  });
  it("sắp xếp: đợi lâu nhất lên đầu", () => {
    expect(inboxOrderBy({ ...DEFAULT_QUERY, sort: "oldest_wait" })[0]).toEqual({ lastInAt: { sort: "asc", nulls: "last" } });
    expect(inboxOrderBy(DEFAULT_QUERY)).toEqual([{ lastAt: "desc" }]);
  });
});

describe("đồng hồ chờ", () => {
  it("chỉ chờ khi khách nhắn sau tin trả lời cuối và chưa xong", () => {
    expect(isWaiting({ lastInAt: "2026-11-06T10:00:00Z", lastOutAt: "2026-11-06T09:00:00Z", status: "open" })).toBe(true);
    expect(isWaiting({ lastInAt: "2026-11-06T10:00:00Z", lastOutAt: "2026-11-06T11:00:00Z", status: "open" })).toBe(false);
    expect(isWaiting({ lastInAt: "2026-11-06T10:00:00Z", lastOutAt: null, status: "done" })).toBe(false);
    expect(isWaiting({ lastInAt: null, lastOutAt: null, status: "open" })).toBe(false);
  });
  it("mức màu và nhãn", () => {
    expect([5, 30, 120, 600].map((m) => waitLevel(m * 60000))).toEqual([0, 1, 2, 3]);
    expect(waitLabel(30e3)).toBe("vừa nhắn");
    expect(waitLabel(5 * 60e3)).toBe("5 phút");
    expect(waitLabel(3 * 3600e3)).toBe("3 giờ");
    expect(waitLabel(50 * 3600e3)).toBe("2 ngày");
  });
});

describe("splitPhones", () => {
  it("tách SĐT nhiều kiểu viết", () => {
    const parts = splitPhones("Số em 0912 345 678 hoặc +84 987.654.321, mã đơn 12345");
    expect(parts.filter((p) => p.phone).map((p) => p.phone)).toEqual(["0912345678", "0987654321"]);
    expect(parts.map((p) => p.t).join("")).toBe("Số em 0912 345 678 hoặc +84 987.654.321, mã đơn 12345");
  });
  it("không bắt dãy số ngắn", () => {
    expect(splitPhones("giá 500000 đ").some((p) => p.phone)).toBe(false);
  });
});
