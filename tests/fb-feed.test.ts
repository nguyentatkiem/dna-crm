import { describe, expect, it } from "vitest";
import { feedEvents, getProvider, toReferral } from "@/lib/sources/providers";
import { appendSignature, effectiveSettings, fillTemplate, pageSettings, postSettings } from "@/lib/fb/pages";
import { explainGraphError, isDemoToken, isDryRun } from "@/lib/fb/graph";

const fb = getProvider("facebook")!;
const ctx = (body: unknown) => ({ raw: JSON.stringify(body), body: body as Record<string, unknown>, headers: new Headers(), settings: {}, url: new URL("https://crm.test/x") });

describe("Facebook feed — bình luận", () => {
  const base = { from: { id: "u1", name: "Nguyễn Thị Lan" }, post: { status_type: "added_video", permalink_url: "https://fb.com/p/1", id: "100_200" }, post_id: "100_200", comment_id: "200_9", parent_id: "100_200", created_time: 1730000000, item: "comment", verb: "add", message: "Giá bao nhiêu ạ 0912345678" };

  it("bình luận mới của khách → hội thoại c:<post>:<người>", () => {
    const [e] = feedEvents("100", base);
    expect(e).toMatchObject({ kind: "comment", channel: "messenger", externalId: "c:100_200:u1", pageId: "100", direction: "in", name: "Nguyễn Thị Lan", text: "Giá bao nhiêu ạ 0912345678" });
    expect(e.comment).toMatchObject({ commentId: "200_9", parentId: "", postId: "100_200", senderId: "u1", verb: "add", fromPage: false, post: { kind: "video" } });
    expect(e.at?.getTime()).toBe(1730000000 * 1000);
  });

  it("trả lời lồng giữ parentId; trang trả lời là direction out", () => {
    const [r] = feedEvents("100", { ...base, comment_id: "200_10", parent_id: "200_9" });
    expect(r.comment?.parentId).toBe("200_9");
    const [pg] = feedEvents("100", { ...base, from: { id: "100", name: "Trang" }, comment_id: "200_11", parent_id: "200_9" });
    expect(pg).toMatchObject({ direction: "out", externalId: "", comment: { fromPage: true } });
  });

  it("sửa / xoá / ẩn", () => {
    for (const verb of ["edited", "remove", "hide", "unhide"]) expect(feedEvents("100", { ...base, verb })[0].comment?.verb).toBe(verb);
    expect(feedEvents("100", { ...base, verb: "lạ" })).toEqual([]);
    expect(feedEvents("100", { ...base, item: "reaction" })).toEqual([]);
  });

  it("livestream", () => {
    expect(feedEvents("100", { ...base, post: { status_type: "added_live_video" } })[0].comment?.post).toMatchObject({ kind: "live", live: true });
  });

  it("bài viết mới của trang", () => {
    const [e] = feedEvents("100", { item: "photo", verb: "add", post_id: "100_300", message: "Hàng mới về", link: "https://img/1.jpg", created_time: 1730000000 });
    expect(e.post).toMatchObject({ postId: "100_300", kind: "photo", message: "Hàng mới về", image: "https://img/1.jpg" });
  });

  it("đi qua provider.messages()", () => {
    const evs = fb.messages!(ctx({ object: "page", entry: [{ id: "100", changes: [{ field: "feed", value: base }, { field: "leadgen", value: {} }] }] }));
    expect(evs).toHaveLength(1);
    expect(evs[0].kind).toBe("comment");
  });
});

describe("Messenger referral", () => {
  it("quảng cáo / m.me ref / plugin", () => {
    expect(toReferral({ source: "ADS", type: "OPEN_THREAD", ad_id: "6001" })).toEqual({ source: "ad", ref: "", adId: "6001", postId: undefined });
    expect(toReferral({ source: "SHORTLINK", type: "OPEN_THREAD", ref: "tet2027" })).toEqual({ source: "ref", ref: "tet2027" });
    expect(toReferral({ source: "CUSTOMER_CHAT_PLUGIN", referer_uri: "https://shop.vn" })).toEqual({ source: "website", ref: "https://shop.vn" });
    expect(toReferral(undefined)).toBeUndefined();
  });

  it("tin nhắn kèm referral của quảng cáo", () => {
    const [e] = fb.messages!(ctx({ entry: [{ id: "100", messaging: [{ sender: { id: "psid1" }, recipient: { id: "100" }, timestamp: 1, message: { mid: "m1", text: "Tư vấn giúp em 0987 654 321", referral: { source: "ADS", ad_id: "6001" } } }] }] }));
    expect(e.referral).toMatchObject({ source: "ad", adId: "6001" });
    expect(e.lead).toMatchObject({ channel: "ads", phone: "0987 654 321", campaign: "Quảng cáo 6001" });
  });

  it("sự kiện referral riêng (khách cũ bấm link m.me)", () => {
    const [e] = fb.messages!(ctx({ entry: [{ id: "100", messaging: [{ sender: { id: "psid2" }, recipient: { id: "100" }, timestamp: 5, referral: { source: "SHORTLINK", ref: "live_t7" } }] }] }));
    expect(e).toMatchObject({ externalId: "psid2", system: true, text: "", referral: { source: "ref", ref: "live_t7" } });
  });

  it("delivery/read vẫn bỏ qua", () => {
    expect(fb.messages!(ctx({ entry: [{ id: "100", messaging: [{ sender: { id: "a" }, recipient: { id: "100" }, delivery: {} }] }] }))).toEqual([]);
  });
});

describe("Cài đặt trang / bài viết", () => {
  it("bài viết ghi đè trang, null = theo trang", () => {
    const page = pageSettings({ settingsJson: JSON.stringify({ autoHidePhone: true, autoLike: true }) });
    const post = postSettings({ settingsJson: JSON.stringify({ autoLike: false, replyComment: " Dạ {ten} check inbox ạ " }) });
    expect(effectiveSettings(page, post)).toMatchObject({ autoHidePhone: true, autoLike: false, autoHideAll: false, replyComment: "Dạ {ten} check inbox ạ" });
  });
  it("JSON hỏng → mặc định", () => {
    expect(pageSettings({ settingsJson: "{" }).signature).toBe("");
    expect(postSettings({ settingsJson: JSON.stringify({ skip: "x" }) }).skip).toBe(false);
  });
  it("biến {ten}", () => {
    expect(fillTemplate("Chào {ten}, em gửi giá qua inbox ạ", { name: "Nguyễn Thị Lan" })).toBe("Chào Lan, em gửi giá qua inbox ạ");
    expect(fillTemplate("Chào {ten}", { name: "Khách bình luận" })).toBe("Chào bạn");
  });
  it("chữ ký không thêm hai lần", () => {
    expect(appendSignature("Dạ vâng ạ", "— Hương Spa")).toBe("Dạ vâng ạ\n— Hương Spa");
    expect(appendSignature("Dạ vâng ạ\n— Hương Spa", "— Hương Spa")).toBe("Dạ vâng ạ\n— Hương Spa");
    expect(appendSignature("Dạ", "")).toBe("Dạ");
  });
});

describe("Graph", () => {
  it("token mẫu / dry run", () => {
    expect(isDemoToken("demo_page_token")).toBe(true);
    expect(isDemoToken("EAAG...")).toBe(false);
    expect(isDryRun("demo_x")).toBe(true);
  });
  it("lỗi tiếng Việt", () => {
    expect(explainGraphError({ code: 190 }).message).toMatch(/hết hạn/);
    expect(explainGraphError({ code: 10, error_subcode: 2018278 }).windowClosed).toBe(true);
    expect(explainGraphError({ code: 999, message: "x" }).message).toMatch(/Facebook báo lỗi 999/);
  });
});
