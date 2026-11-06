import { describe, expect, it } from "vitest";
import { clickSig, clickUrl, extractLinks, isAllowedClick, maskAddress, openUrl, rewriteLinks, unsubToken, verify, verifyUnsubToken } from "@/lib/marketing/tokens";

describe("mã huỷ nhận tin", () => {
  const p = { workspaceId: "ws_1", channel: "email", address: "lan@gmail.com" };

  it("ký rồi đọc lại đúng nội dung", () => {
    expect(verifyUnsubToken(unsubToken(p))).toEqual(p);
  });

  it("địa chỉ có ký tự | vẫn đọc đúng", () => {
    const q = { ...p, channel: "zalo", address: "uid|la" };
    expect(verifyUnsubToken(unsubToken(q))).toEqual(q);
  });

  it("từ chối mã bị sửa, thiếu chữ ký hoặc rác", () => {
    const t = unsubToken(p);
    const [body, sig] = t.split(".");
    const forged = Buffer.from("ws_2|email|lan@gmail.com").toString("base64url");
    expect(verifyUnsubToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyUnsubToken(`${body}.${sig.slice(0, -1)}A`)).toBeNull();
    expect(verifyUnsubToken(body)).toBeNull();
    expect(verifyUnsubToken("")).toBeNull();
    expect(verifyUnsubToken("%%%.abc")).toBeNull();
  });

  it("chữ ký tách theo mục đích: mã mở không dùng làm mã nhấp", () => {
    const s = clickSig("b1", "r1", "https://a.vn");
    expect(verify("click", "b1|r1|https://a.vn", s)).toBe(true);
    expect(verify("open", "b1|r1|https://a.vn", s)).toBe(false);
  });

  it("che địa chỉ khi hiện công khai", () => {
    expect(maskAddress("lanxinh@gmail.com")).toBe("lan***@gmail.com");
    expect(maskAddress("0912345678")).toBe("0912***678");
  });
});

describe("link theo dõi nhấp", () => {
  const body = "Xem ưu đãi tại https://shop.vn/uu-dai?x=1. Hoặc http://blog.vn/bai-viet, gọi ngay!";

  it("lấy đúng các link trong nội dung, bỏ dấu câu ở cuối", () => {
    expect(extractLinks(body)).toEqual(["https://shop.vn/uu-dai?x=1", "http://blog.vn/bai-viet"]);
  });

  it("chỉ cho chuyển hướng tới link có trong nội dung gốc", () => {
    expect(isAllowedClick(body, "https://shop.vn/uu-dai?x=1")).toBe(true);
    expect(isAllowedClick(body, "https://evil.com")).toBe(false);
    expect(isAllowedClick(body, "https://shop.vn/uu-dai")).toBe(false);
    expect(isAllowedClick("javascript:alert(1) https://a.vn", "javascript:alert(1)")).toBe(false);
    expect(isAllowedClick(body, "không phải url")).toBe(false);
  });

  it("thay link bằng link theo dõi có chữ ký, giữ dấu câu", () => {
    const out = rewriteLinks(body, (u) => clickUrl("https://crm.vn", "b1", "r1", u));
    expect(out).not.toContain(" https://shop.vn");
    expect(out).toContain("/api/public/track/click?");
    expect(out).toMatch(/\. Hoặc /);
    const q = new URL(out.match(/https:\/\/crm\.vn\S+?(?=\. )/)![0]).searchParams;
    expect(q.get("u")).toBe("https://shop.vn/uu-dai?x=1");
    expect(verify("click", `b1|r1|${q.get("u")}`, q.get("s")!)).toBe(true);
  });

  it("link pixel mở có chữ ký", () => {
    const q = new URL(openUrl("https://crm.vn", "b1", "r1")).searchParams;
    expect(verify("open", "b1|r1", q.get("s")!)).toBe(true);
  });
});
