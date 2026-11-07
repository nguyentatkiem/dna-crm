import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { countParams, explainWaError, fillWaTemplate, parseWaWebhook, toTemplate, verifyWaSignature, waWindow } from "@/lib/channels/whatsapp";
import { instagramEvents } from "@/lib/channels/instagram";
import { getProvider } from "@/lib/sources/providers";
import { shopeeAuthUrl, shopeePushSignature, shopeeQuery, shopeeSign, tiktokAuthUrl, tiktokSign, tiktokUrl, tiktokWebhookSignature, verifyShopeePush, verifyTiktokWebhook } from "@/lib/channels/shop-sign";
import { buildLines, mapShopeeOrder, mapShopStatus, mapTiktokOrder, unmask } from "@/lib/channels/order-map";
import { demoShopeeOrders } from "@/lib/channels/shopee";
import { demoTiktokOrders } from "@/lib/channels/tiktok";

/* ───────────── WhatsApp ───────────── */

const waBody = (value: object) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "84901234567", phone_number_id: "1065" }, ...value } }] }] });

describe("WhatsApp webhook", () => {
  it("tin văn bản + tên hồ sơ + lead theo wa_id", () => {
    const [g] = parseWaWebhook(waBody({ contacts: [{ profile: { name: "Lan" }, wa_id: "84912345678" }], messages: [{ from: "84912345678", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Giá bao nhiêu ạ" } }] }));
    expect(g.phoneNumberId).toBe("1065");
    const ev = g.events[0];
    expect(ev).toMatchObject({ channel: "whatsapp", externalId: "84912345678", pageId: "1065", direction: "in", text: "Giá bao nhiêu ạ", msgId: "wamid.1", name: "Lan" });
    expect(ev.at?.getTime()).toBe(1700000000 * 1000);
    expect(ev.lead).toMatchObject({ provider: "whatsapp", phone: "84912345678", externalId: "wa:wamid.1" });
  });
  it("ảnh có chú thích, vị trí, nút bấm, quảng cáo Click-to-WhatsApp", () => {
    const [g] = parseWaWebhook(
      waBody({
        messages: [
          { from: "1", id: "a", timestamp: "1", type: "image", image: { id: "MEDIA", caption: "mẫu này" } },
          { from: "1", id: "b", timestamp: "1", type: "location", location: { latitude: 21.03, longitude: 105.8, name: "Hồ Gươm" } },
          { from: "1", id: "c", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "Đặt lịch" } } },
          { from: "1", id: "d", timestamp: "1", type: "text", text: { body: "hi" }, referral: { source_type: "ad", source_id: "AD1", headline: "Giảm 20%" } },
        ],
      }),
    );
    expect(g.events[0]).toMatchObject({ text: "mẫu này", attachments: [{ type: "image" }] });
    expect(g.events[1].attachments?.[0]).toMatchObject({ type: "location", lat: 21.03, lng: 105.8 });
    expect(g.events[2].text).toBe("[Chọn] Đặt lịch");
    expect(g.events[3].referral).toEqual({ source: "ad", ref: "Giảm 20%", adId: "AD1" });
    expect(g.events[3].lead?.channel).toBe("ads");
  });
  it("trạng thái gửi và lỗi 131047", () => {
    const [g] = parseWaWebhook(
      waBody({
        statuses: [
          { id: "wamid.9", status: "read", timestamp: "1700000001", recipient_id: "849" },
          { id: "wamid.8", status: "failed", timestamp: "1700000001", recipient_id: "849", errors: [{ code: 131047, title: "Re-engagement message" }] },
          { id: "wamid.7", status: "deleted" },
        ],
      }),
    );
    expect(g.events).toEqual([]);
    expect(g.statuses.map((s) => s.status)).toEqual(["read", "failed"]);
    expect(g.statuses[1].error).toMatch(/24 giờ/);
  });
  it("bỏ qua object khác và thay đổi không phải messages", () => {
    expect(parseWaWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseWaWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual([]);
  });
  it("kiểm chữ ký X-Hub-Signature-256", () => {
    const raw = JSON.stringify(waBody({}));
    const sig = "sha256=" + createHmac("sha256", "wa-secret").update(raw).digest("hex");
    expect(verifyWaSignature(raw, sig, "wa-secret")).toBe(true);
    expect(verifyWaSignature(raw, "sha256=sai", "wa-secret")).toBe(false);
    expect(verifyWaSignature(raw + " ", sig, "wa-secret")).toBe(false);
    expect(verifyWaSignature(raw, null, "")).toBe(true);
  });
  it("mẫu tin: đếm biến, điền biến, đọc components", () => {
    expect(countParams("Chào {{1}}, lịch {{2}} — {{1}}")).toBe(2);
    expect(fillWaTemplate("Chào {{1}}, lịch {{ 2 }}", ["Lan", "9h"])).toBe("Chào Lan, lịch 9h");
    const t = toTemplate({ name: "x", language: "vi", status: "APPROVED", category: "UTILITY", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Đơn {{1}}" }, { type: "FOOTER", text: "Shop" }] });
    expect(t).toMatchObject({ body: "Đơn {{1}}", header: "[image]", footer: "Shop", params: 1 });
    expect(explainWaError({ code: 131047 }).windowClosed).toBe(true);
    expect(explainWaError({ code: 190 }).message).toMatch(/token/);
  });
  it("cửa sổ 24 giờ", () => {
    const now = Date.UTC(2026, 10, 7, 12);
    expect(waWindow({ lastInAt: new Date(now - 23 * 3600e3) }, now).open).toBe(true);
    expect(waWindow({ lastInAt: new Date(now - 25 * 3600e3) }, now).open).toBe(false);
    expect(waWindow({ lastInAt: null }, now).open).toBe(false);
  });
});

/* ───────────── Instagram ───────────── */

describe("Instagram webhook", () => {
  const IG = "17841400000000001";
  it("tin Direct, echo của trang, bỏ qua read/xoá", () => {
    const evs = instagramEvents({
      object: "instagram",
      entry: [
        {
          id: IG,
          time: 1700000000000,
          messaging: [
            { sender: { id: "IGSID1" }, recipient: { id: IG }, timestamp: 1700000000000, message: { mid: "m1", text: "Còn hàng không 0912 345 678", attachments: [{ type: "image", payload: { url: "https://x/a.jpg" } }] } },
            { sender: { id: IG }, recipient: { id: "IGSID1" }, timestamp: 1700000001000, message: { mid: "m2", text: "Dạ còn", is_echo: true } },
            { sender: { id: "IGSID1" }, recipient: { id: IG }, timestamp: 1, read: { mid: "m2" } },
            { sender: { id: "IGSID1" }, recipient: { id: IG }, timestamp: 1, message: { mid: "m3", is_deleted: true } },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ channel: "instagram", externalId: "IGSID1", pageId: IG, direction: "in", msgId: "m1", attachments: [{ type: "image", url: "https://x/a.jpg" }] });
    expect(evs[0].lead).toMatchObject({ provider: "instagram", phone: "0912 345 678" });
    expect(evs[1]).toMatchObject({ externalId: "IGSID1", direction: "out", msgId: "m2", lead: undefined });
  });
  it("bình luận, trả lời của chính tài khoản, live", () => {
    const evs = instagramEvents({
      object: "instagram",
      entry: [
        {
          id: IG,
          time: 1700000000,
          changes: [
            { field: "comments", value: { from: { id: "U1", username: "lan.ng" }, media: { id: "MEDIA1", media_product_type: "REELS" }, id: "C1", text: "Giá sao ạ" } },
            { field: "comments", value: { from: { id: IG, username: "shop" }, media: { id: "MEDIA1" }, id: "C2", parent_id: "C1", text: "Dạ check Direct ạ" } },
            { field: "live_comments", value: { from: { id: "U2" }, media: { id: "LIVE1", media_product_type: "LIVE" }, id: "C3", text: "Chốt" } },
            { field: "mentions", value: { media_id: "x" } },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(3);
    expect(evs[0]).toMatchObject({ kind: "comment", externalId: "c:MEDIA1:U1", direction: "in", name: "@lan.ng", comment: { commentId: "C1", postId: "MEDIA1", parentId: "", fromPage: false, verb: "add", post: { kind: "video" } } });
    expect(evs[1]).toMatchObject({ externalId: "", direction: "out", comment: { fromPage: true, parentId: "C1" } });
    expect(evs[2].comment?.post).toEqual({ kind: "live", live: true });
  });
  it("webhook Instagram trỏ chung URL Facebook vẫn nhận được", () => {
    const fb = getProvider("facebook")!;
    const body = { object: "instagram", entry: [{ id: IG, messaging: [{ sender: { id: "S" }, recipient: { id: IG }, timestamp: 1, message: { mid: "x", text: "hi" } }] }] };
    const evs = fb.messages!({ raw: JSON.stringify(body), body, headers: new Headers(), settings: {}, url: new URL("https://crm.test/api/hooks/k/facebook") });
    expect(evs[0]).toMatchObject({ channel: "instagram", externalId: "S" });
  });
});

/* ───────────── Ký Shopee / TikTok Shop (vector cố định) ───────────── */

describe("Ký Shopee v2", () => {
  const KEY = "test_partner_key";
  it("API công khai: partner_id + path + timestamp", () => {
    expect(shopeeSign(KEY, { partnerId: 2001234, path: "/api/v2/shop/auth_partner", timestamp: 1700000000 })).toBe("79adf5ef36d41e720bcb78997cef9b2b5ddcfdd680cac5f73b965e6f0b14eada");
  });
  it("API shop: thêm access_token + shop_id", () => {
    const q = shopeeQuery(KEY, { partnerId: "2001234", path: "/api/v2/order/get_order_list", timestamp: 1700000000, accessToken: "tok_abc", shopId: 987654 });
    expect(q).toEqual({ partner_id: "2001234", timestamp: "1700000000", sign: "cdbe6a5438965694e40545bb3fede1d19bf3854adf952d1225330f916dbd76c5", access_token: "tok_abc", shop_id: "987654" });
  });
  it("link uỷ quyền có redirect, máy chủ cấu hình được", () => {
    const u = new URL(shopeeAuthUrl({ partnerId: "2001234", partnerKey: KEY, redirect: "https://crm.test/cb?state=a.b", timestamp: 1700000000, baseUrl: "https://partner.test-stable.shopeemobile.com" }));
    expect(u.origin + u.pathname).toBe("https://partner.test-stable.shopeemobile.com/api/v2/shop/auth_partner");
    expect(u.searchParams.get("sign")).toBe("79adf5ef36d41e720bcb78997cef9b2b5ddcfdd680cac5f73b965e6f0b14eada");
    expect(u.searchParams.get("redirect")).toBe("https://crm.test/cb?state=a.b");
  });
  it("chữ ký push: URL|body", () => {
    const raw = '{"shop_id":1,"code":3}';
    const sig = createHmac("sha256", KEY).update(`https://crm.test/api/hooks/k/shopee-shop|${raw}`).digest("hex");
    expect(shopeePushSignature(KEY, "https://crm.test/api/hooks/k/shopee-shop", raw)).toBe(sig);
    expect(verifyShopeePush(KEY, "https://crm.test/api/hooks/k/shopee-shop", raw, sig)).toBe(true);
    expect(verifyShopeePush(KEY, "https://crm.test/api/hooks/k/shopee-shop", raw + " ", sig)).toBe(false);
    expect(verifyShopeePush(KEY, "https://crm.test/x", raw, null)).toBe(false);
  });
});

describe("Ký TikTok Shop 202309", () => {
  const SECRET = "test_app_secret";
  it("sắp xếp query, bỏ sign/access_token, nối body, bọc app_secret", () => {
    const sig = tiktokSign(SECRET, { path: "/order/202309/orders/search", query: { timestamp: 1700000000, shop_cipher: "CIPHER", page_size: 20, app_key: "abc123", sign: "old", access_token: "tok" }, body: '{"order_status":"COMPLETED"}' });
    expect(sig).toBe("fa5829e7afbeb79db86910ec205aa01283365b166282a29314e80f7f479dba59");
  });
  it("URL đã ký (không body, không shop_cipher cho /authorization)", () => {
    const u = new URL(tiktokUrl({ appKey: "abc123", appSecret: SECRET, path: "/authorization/202309/shops", timestamp: 1700000000 }));
    expect(u.origin).toBe("https://open-api.tiktokglobalshop.com");
    expect(u.searchParams.get("sign")).toBe("93c615a8a03c2784bb13d9fa67bd57db72df33f669e056e0e80b358598ed02e0");
    expect(u.searchParams.has("shop_cipher")).toBe(false);
  });
  it("link uỷ quyền mới (service_id) và cũ (app_key)", () => {
    expect(tiktokAuthUrl({ appKey: "abc", serviceId: "7123", state: "id.n" })).toBe("https://services.tiktokshop.com/open/authorize?service_id=7123&state=id.n");
    expect(tiktokAuthUrl({ appKey: "abc", state: "s" })).toBe("https://auth.tiktok-shops.com/oauth/authorize?app_key=abc&state=s");
  });
  it("chữ ký webhook: HMAC(app_secret, app_key + body)", () => {
    const raw = '{"type":1}';
    const sig = createHmac("sha256", SECRET).update("abc123" + raw).digest("hex");
    expect(tiktokWebhookSignature("abc123", SECRET, raw)).toBe(sig);
    expect(verifyTiktokWebhook("abc123", SECRET, raw, sig)).toBe(true);
    expect(verifyTiktokWebhook("abc123", SECRET, raw, "x")).toBe(false);
  });
});

/* ───────────── Chuẩn hoá đơn sàn ───────────── */

describe("Đơn sàn → đơn CRM", () => {
  const products = [
    { id: "p1", code: "SR-C", sku: "", name: "Serum Vitamin C 30ml", unit: "chai", vat: 0 },
    { id: "p2", code: "KCN", sku: "KCN50", name: "Kem chống nắng SPF50", unit: "tuýp", vat: 8 },
  ];
  it("trạng thái", () => {
    expect(mapShopStatus("shopee", "UNPAID")).toBe("new");
    expect(mapShopStatus("shopee", "READY_TO_SHIP")).toBe("confirmed");
    expect(mapShopStatus("shopee", "TO_CONFIRM_RECEIVE")).toBe("shipping");
    expect(mapShopStatus("shopee", "COMPLETED")).toBe("done");
    expect(mapShopStatus("shopee", "IN_CANCEL")).toBe("cancelled");
    expect(mapShopStatus("tiktok", "AWAITING_COLLECTION")).toBe("confirmed");
    expect(mapShopStatus("tiktok", "IN_TRANSIT")).toBe("shipping");
    expect(mapShopStatus("tiktok", "DELIVERED")).toBe("done");
    expect(mapShopStatus("tiktok", "CANCELLED")).toBe("cancelled");
    expect(mapShopStatus("tiktok", "LẠ")).toBe("new");
  });
  it("SĐT: chuẩn hoá, số bị che thì bỏ", () => {
    expect(unmask("84912345678")).toBe("0912345678");
    expect(unmask("******78")).toBe("");
    expect(unmask("(+84)9*******34")).toBe("");
  });
  it("Shopee: khách, địa chỉ, dòng hàng khớp SKU (sku rồi code), phí ship thành dòng riêng", () => {
    const o = mapShopeeOrder(demoShopeeOrders("220000001")[0]);
    expect(o).toMatchObject({ channel: "shopee", externalId: "2611DEMO00101", status: "done", paid: true, buyerName: "Nguyễn Thị Lan", phone: "0912345678", province: "Hà Nội", district: "Quận Cầu Giấy", ward: "Phường Trung Hoà", total: 1125000 });
    const { lines, discount, matched } = buildLines(o, products);
    expect(matched).toBe(2);
    expect(lines.map((l) => [l.productId, l.code, l.qty, l.price])).toEqual([
      ["p1", "SR-C", 1, 690000],
      ["p2", "KCN", 1, 420000],
      [undefined, "SHIP", 1, 15000],
    ]);
    expect(discount).toBe(0);
    // Giá sàn đã gồm thuế: VAT = 0 kể cả khi sản phẩm CRM có VAT.
    expect(lines.every((l) => l.vatPct === 0)).toBe(true);
  });
  it("Shopee: chưa thanh toán và số bị che", () => {
    const o = mapShopeeOrder(demoShopeeOrders("220000001")[3]);
    expect(o).toMatchObject({ status: "new", paid: false, phone: "" });
  });
  it("TikTok: gộp line_items theo SKU, giảm giá của shop thành chiết khấu đơn, SKU lạ thành dòng tự do", () => {
    const [done, , discounted] = demoTiktokOrders("7000000000001").map(mapTiktokOrder);
    expect(done).toMatchObject({ channel: "tiktok", status: "done", paid: true, phone: "0903111222", province: "Hà Nội", ward: "Phường Hàng Bài", total: 1395000 });
    expect(done.items).toEqual([{ sku: "SR-C", name: "Serum Vitamin C 30ml", qty: 2, price: 690000 }]);
    const b = buildLines(discounted, products);
    expect(b.matched).toBe(0);
    expect(b.lines).toEqual([{ productId: undefined, code: "SRM-TT", name: "Sữa rửa mặt trà xanh 150ml", unit: "cái", qty: 2, price: 150000, discountPct: 0, vatPct: 0 }]);
    expect(b.discount).toBe(20000);
  });
  it("đơn thiếu dữ liệu không lỗi", () => {
    const o = mapTiktokOrder({ id: "1" });
    expect(o).toMatchObject({ externalId: "1", status: "new", total: 0, items: [], buyerName: "Người mua TikTok Shop" });
    expect(buildLines(o, products)).toEqual({ lines: [], discount: 0, matched: 0 });
  });
});
