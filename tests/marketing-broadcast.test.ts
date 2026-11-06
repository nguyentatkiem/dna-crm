import { describe, expect, it, vi } from "vitest";

// broadcast.ts kéo theo Prisma và các kênh gửi; chỉ kiểm thử hàm thuần.
vi.mock("@/lib/db", () => ({ db: {}, dbRaw: {}, parseJson: (s: string, f: unknown) => (s ? JSON.parse(s) : f) }));
vi.mock("@/lib/records", () => ({ createRecord: vi.fn() }));
vi.mock("@/lib/marketing/messaging", () => ({ channelReady: vi.fn(), dryRun: () => false, sendMessage: vi.fn() }));
vi.mock("@/lib/care/segments", () => ({ resolveSegment: vi.fn(async () => []) }));

const { planRecipients, planCounts, normAddress, renderMessage } = await import("@/lib/marketing/broadcast");
const { verifyUnsubToken } = await import("@/lib/marketing/tokens");

const c = (id: string, x: Partial<{ phone: string; email: string; zaloUid: string }> = {}) => ({ id, title: `Khách ${id}`, phone: "", email: "", zaloUid: "", owner: "", ...x });

describe("lọc người nhận", () => {
  const list = [
    c("1", { phone: "0912 345 678", email: "A@Gmail.com" }),
    c("2", { phone: "+84912345678" }), // trùng số với khách 1
    c("3", { email: "b@gmail.com" }), // thiếu SĐT
    c("4", { phone: "0987654321", email: "khong-hop-le" }),
    c("5", { phone: "0901111222" }),
    c("1", { phone: "0912345678" }), // lặp id
  ];

  it("SMS: bỏ người thiếu số, đã huỷ, trùng số", () => {
    const p = planRecipients(list, "sms", new Set(["0901111222"]));
    expect(p.send.map((r) => [r.contact.id, r.to])).toEqual([
      ["1", "0912345678"],
      ["4", "0987654321"],
    ]);
    expect(p.missing.map((x) => x.id)).toEqual(["3"]);
    expect(p.unsubscribed.map((x) => x.id)).toEqual(["5"]);
    expect(p.duplicate.map((x) => x.id)).toEqual(["2"]);
    expect(planCounts(p)).toEqual({ total: 5, send: 2, missing: 1, unsubscribed: 1, duplicate: 1 });
  });

  it("email: chuẩn hoá chữ hoa, email sai coi như thiếu, danh sách huỷ so sau chuẩn hoá", () => {
    const p = planRecipients(list, "email", new Set([normAddress("email", "B@gmail.com")]));
    expect(p.send.map((r) => r.to)).toEqual(["a@gmail.com"]);
    expect(p.unsubscribed.map((x) => x.id)).toEqual(["3"]);
    expect(p.missing.map((x) => x.id).sort()).toEqual(["2", "4", "5"]);
  });

  it("Zalo: cần Zalo user id", () => {
    const p = planRecipients([c("1", { zaloUid: "u1" }), c("2", { phone: "0912345678" })], "zalo", new Set());
    expect(p.send.map((r) => r.to)).toEqual(["u1"]);
    expect(p.missing).toHaveLength(1);
  });
});

describe("dựng nội dung", () => {
  const vars = { ten: "Lan", ten_doanh_nghiep: "Hương Spa", so_dien_thoai: "0912345678", nguoi_phu_trach: "Thảo" };
  const ctx = { origin: "https://crm.vn", workspaceId: "ws1", to: "lan@gmail.com", broadcastId: "b1", recordId: "r1" };

  it("email có biến, link theo dõi, chân trang huỷ và pixel mở", () => {
    const r = renderMessage({ channel: "email", subject: "Chào {ten}", body: "Chào {ten}, xem https://shop.vn/a nhé" }, vars, ctx);
    expect(r.subject).toBe("Chào Lan");
    expect(r.text).toContain("/api/public/track/click?");
    expect(r.text).toContain("https://crm.vn/u/");
    expect(r.html).toContain("/api/public/track/open?");
    expect(r.html).toContain(">https://shop.vn/a</a>");
    const token = r.unsubUrl!.split("/u/")[1];
    expect(verifyUnsubToken(token)).toEqual({ workspaceId: "ws1", channel: "email", address: "lan@gmail.com" });
  });

  it("email gửi thử (không có recordId) không gắn theo dõi", () => {
    const r = renderMessage({ channel: "email", subject: "", body: "https://shop.vn/a" }, vars, { ...ctx, broadcastId: undefined, recordId: undefined });
    expect(r.text).not.toContain("track/click");
    expect(r.html).not.toContain("track/open");
  });

  it("HTML được thoát ký tự để nội dung không chèn được thẻ", () => {
    const r = renderMessage({ channel: "email", subject: "", body: "<script>x</script>" }, vars, ctx);
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).not.toContain("<script>");
  });

  it("SMS thêm dòng từ chối nhận tin; Zalo giữ nguyên", () => {
    expect(renderMessage({ channel: "sms", subject: "", body: "{ten_doanh_nghiep}: Chao {ten}" }, vars, { ...ctx, to: "0912345678" }).text).toMatch(/^Hương Spa: Chao Lan\nTu choi nhan tin: https:\/\/crm\.vn\/u\//);
    expect(renderMessage({ channel: "zalo", subject: "", body: "Chào {ten}" }, vars, ctx).text).toBe("Chào Lan");
  });
});
