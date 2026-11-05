import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getProvider } from "@/lib/sources/providers";
import type { Integrations } from "@/lib/settings";

// Payload mẫu theo tài liệu từng nền tảng. Khoá là khoá giả, chỉ dùng để kiểm chữ ký.
const ctx = (raw: string, settings: Integrations, headers: Record<string, string> = {}, url = "https://crm.test/api/hooks/key/x") => ({
  raw,
  body: JSON.parse(raw),
  headers: new Headers(headers),
  settings,
  url: new URL(url),
});
const p = (k: string) => {
  const x = getProvider(k);
  if (!x) throw new Error(`thiếu provider ${k}`);
  return x;
};

describe("Facebook Lead Ads", () => {
  const raw = JSON.stringify({ object: "page", entry: [{ id: "1", changes: [{ field: "leadgen", value: { leadgen_id: "444", form_id: "9" } }] }] });
  const secret = "fb-app-secret-gia";
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");

  it("kiểm chữ ký x-hub-signature-256", () => {
    expect(p("facebook").verify!(ctx(raw, { facebook: { appSecret: secret } }, { "x-hub-signature-256": sig }))).toBe(true);
    expect(p("facebook").verify!(ctx(raw, { facebook: { appSecret: secret } }, { "x-hub-signature-256": "sha256=sai" }))).toBe(false);
    expect(p("facebook").verify!(ctx(raw, {}))).toBe(true);
  });
  it("trả lời xác minh webhook", () => {
    const c = ctx("{}", { facebook: { verifyToken: "abc" } }, {}, "https://crm.test/x?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=123");
    expect(p("facebook").challenge!(c)).toBe("123");
    expect(p("facebook").challenge!({ ...c, url: new URL("https://crm.test/x?hub.mode=subscribe&hub.verify_token=sai&hub.challenge=123") })).toBeNull();
  });
  it("đọc leadgen khi chưa có Page token (không gọi mạng)", async () => {
    const leads = await p("facebook").parse(ctx(raw, {}));
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ provider: "facebook", channel: "ads", externalId: "444" });
    expect(leads[0].note).toContain("Page Access Token");
  });
});

describe("Zalo OA", () => {
  const appId = "123456";
  const key = "zalo-secret-gia";
  const body = { app_id: appId, event_name: "user_submit_info", timestamp: "1730000000000", sender: { id: "u1" }, info: { name: "Lê Hoa", phone: "84912345678", address: "12 Lê Lợi", city: "Huế" } };
  const raw = JSON.stringify(body);
  const mac = createHash("sha256").update(appId + raw + body.timestamp + key).digest("hex");

  it("kiểm chữ ký X-ZEvent-Signature", () => {
    expect(p("zalo").verify!(ctx(raw, { zalo: { appId, secretKey: key } }, { "x-zevent-signature": `mac=${mac}` }))).toBe(true);
    expect(p("zalo").verify!(ctx(raw, { zalo: { appId, secretKey: key } }, { "x-zevent-signature": "mac=00" }))).toBe(false);
  });
  it("user_submit_info → lead có tên, SĐT, địa chỉ", async () => {
    const [l] = await p("zalo").parse(ctx(raw, {}));
    expect(l).toMatchObject({ name: "Lê Hoa", phone: "84912345678", zaloUid: "u1", channel: "zalo" });
    expect(l.note).toContain("Huế");
  });
  // Tin nhắn / quan tâm OA đi qua messages() (Hộp thư), parse() chỉ nhận form gửi thông tin.
  it("tin nhắn có SĐT được nhận diện (Hộp thư)", () => {
    const r = JSON.stringify({ event_name: "user_send_text", timestamp: "1", sender: { id: "u2" }, message: { msg_id: "m1", text: "Tư vấn giúp em, sđt 0987 654 321" } });
    expect(p("zalo").parse(ctx(r, {}))).toEqual([]);
    const [m] = p("zalo").messages!(ctx(r, {}));
    expect(m).toMatchObject({ direction: "in", externalId: "u2", msgId: "m1" });
    expect(m.lead?.phone?.replace(/\D/g, "")).toBe("0987654321");
  });
  it("follow → lead người theo dõi, sự kiện lạ → bỏ qua", () => {
    const [m] = p("zalo").messages!(ctx(JSON.stringify({ event_name: "follow", timestamp: "1", follower: { id: "u3" } }), {}));
    expect(m.lead?.externalId).toBe("follow:u3");
    expect(p("zalo").messages!(ctx(JSON.stringify({ event_name: "lạ" }), {}))).toEqual([]);
  });
});

const ORDER = {
  id: 820982911946154500,
  name: "#1001",
  email: "khach@email.vn",
  phone: "+84912000111",
  total_price: "1250000",
  financial_status: "paid",
  customer: { first_name: "An", last_name: "Nguyễn" },
  shipping_address: { name: "Nguyễn An", phone: "0912000111" },
  line_items: [{ title: "Serum C", quantity: 2 }, { title: "Kem chống nắng", quantity: 1 }],
};

describe.each([
  ["shopify", "x-shopify-hmac-sha256"],
  ["haravan", "x-haravan-hmacsha256"],
])("%s", (key, header) => {
  const raw = JSON.stringify(ORDER);
  const secret = `${key}-secret-gia`;
  const sig = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const settings = { [key]: { secret } } as Integrations;

  it("kiểm HMAC base64 trên body gốc", () => {
    expect(p(key).verify!(ctx(raw, settings, { [header]: sig }))).toBe(true);
    expect(p(key).verify!(ctx(raw, settings, { [header]: "c2Fp" }))).toBe(false);
    expect(p(key).verify!(ctx(raw + " ", settings, { [header]: sig }))).toBe(false);
  });
  it("đơn đã thanh toán → đơn thắng, đủ mặt hàng", async () => {
    const [l] = await p(key).parse(ctx(raw, {}));
    expect(l.channel).toBe("ecommerce");
    expect(l.name).toBe("Nguyễn An");
    expect(l.phone).toBe("+84912000111");
    expect(l.order).toMatchObject({ code: "#1001", amount: 1250000, state: "won" });
    expect(l.order!.items).toBe("Serum C x2, Kem chống nắng x1");
    expect(l.externalId).toBe(`${ORDER.id}:won`);
  });
  it("đơn huỷ → thua", async () => {
    const [l] = await p(key).parse(ctx(JSON.stringify({ ...ORDER, cancelled_at: "2026-01-01" }), {}));
    expect(l.order!.state).toBe("lost");
  });
});

describe("Shopee", () => {
  const raw = JSON.stringify({ shop_id: 1, code: 3, data: { ordersn: "2601010ABC", status: "COMPLETED" } });
  const url = "https://crm.test/api/hooks/abc/shopee";
  const key = "shopee-partner-key-gia";
  const sig = createHmac("sha256", key).update(`https://crm.test/api/hooks/abc/shopee|${raw}`).digest("hex");

  it("kiểm chữ ký Authorization = HMAC(url|body)", () => {
    expect(p("shopee").verify!(ctx(raw, { shopee: { partnerKey: key } }, { authorization: sig }, url))).toBe(true);
    expect(p("shopee").verify!(ctx(raw, { shopee: { partnerKey: key } }, { authorization: sig }, url.replace("abc", "khac")))).toBe(false);
  });
  it("đơn hoàn tất → đơn thắng, không tạo khách giả có SĐT", async () => {
    const [l] = await p("shopee").parse(ctx(raw, {}, {}, url));
    expect(l.order).toMatchObject({ code: "2601010ABC", state: "won" });
    expect(l.phone).toBeUndefined();
  });
  it("đơn huỷ → thua; thiếu mã đơn → bỏ qua", async () => {
    expect((await p("shopee").parse(ctx(JSON.stringify({ data: { ordersn: "X", status: "CANCELLED" } }), {})))[0].order!.state).toBe("lost");
    expect(await p("shopee").parse(ctx(JSON.stringify({ data: {} }), {}))).toEqual([]);
  });
});

describe("Webhook website", () => {
  it("nhận tên trường tiếng Việt và UTM", async () => {
    const raw = JSON.stringify({ ho_ten: "Phạm Minh", so_dien_thoai: "0909 111 222", utm_source: "facebook", utm_medium: "cpc", utm_campaign: "tet" });
    const [l] = await p("webhook").parse(ctx(raw, {}));
    expect(l).toMatchObject({ name: "Phạm Minh", phone: "0909 111 222", channel: "ads", campaign: "tet", providerLabel: "Facebook" });
  });
  it("mã bí mật header x-crm-secret", () => {
    expect(p("webhook").verify!(ctx("{}", { webhook: { secret: "s" } }, { "x-crm-secret": "s" }))).toBe(true);
    expect(p("webhook").verify!(ctx("{}", { webhook: { secret: "s" } }, {}))).toBe(false);
  });
});
