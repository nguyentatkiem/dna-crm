// Ký yêu cầu Shopee Open Platform v2 và TikTok Shop Open API (202309). Thuần, có kiểm thử với đầu vào cố định.
//
// Máy chủ và đường dẫn để cấu hình được (ChannelAccount.credentials.baseUrl / authBaseUrl) vì sàn hay đổi phiên bản:
//   Shopee   live    https://partner.shopeemobile.com          sandbox https://partner.test-stable.shopeemobile.com
//   TikTok   API     https://open-api.tiktokglobalshop.com     auth    https://auth.tiktok-shops.com
//            uỷ quyền (mới) https://services.tiktokshop.com/open/authorize?service_id=…
import { createHmac, timingSafeEqual } from "node:crypto";

const hmacHex = (key: string, data: string) => createHmac("sha256", key).update(data, "utf8").digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* ───────────── Shopee ───────────── */

export const SHOPEE_BASE = "https://partner.shopeemobile.com";
export const SHOPEE_PATHS = {
  authPartner: "/api/v2/shop/auth_partner",
  tokenGet: "/api/v2/auth/token/get",
  tokenRefresh: "/api/v2/auth/access_token/get",
  orderList: "/api/v2/order/get_order_list",
  orderDetail: "/api/v2/order/get_order_detail",
  shopInfo: "/api/v2/shop/get_shop_info",
} as const;

/**
 * Chữ ký Shopee v2 = hex(HMAC-SHA256(partner_key, base)), với
 *   API công khai (auth, token): base = partner_id + path + timestamp
 *   API của shop:               base = partner_id + path + timestamp + access_token + shop_id
 */
export function shopeeSign(partnerKey: string, p: { partnerId: string | number; path: string; timestamp: number; accessToken?: string; shopId?: string | number }) {
  const base = `${p.partnerId}${p.path}${p.timestamp}${p.accessToken ?? ""}${p.shopId ?? ""}`;
  return hmacHex(partnerKey, base);
}

/** Query chung cho một lời gọi Shopee (partner_id, timestamp, sign [+ access_token, shop_id]). */
export function shopeeQuery(partnerKey: string, p: { partnerId: string | number; path: string; timestamp: number; accessToken?: string; shopId?: string | number }) {
  const q: Record<string, string> = { partner_id: String(p.partnerId), timestamp: String(p.timestamp), sign: shopeeSign(partnerKey, p) };
  if (p.accessToken) q.access_token = p.accessToken;
  if (p.shopId) q.shop_id = String(p.shopId);
  return q;
}

/** Link chủ shop bấm để uỷ quyền cho ứng dụng; Shopee chuyển về redirect kèm ?code=&shop_id=. */
export function shopeeAuthUrl(p: { partnerId: string; partnerKey: string; redirect: string; timestamp: number; baseUrl?: string }) {
  const path = SHOPEE_PATHS.authPartner;
  const u = new URL(path, p.baseUrl || SHOPEE_BASE);
  for (const [k, v] of Object.entries(shopeeQuery(p.partnerKey, { partnerId: p.partnerId, path, timestamp: p.timestamp }))) u.searchParams.set(k, v);
  u.searchParams.set("redirect", p.redirect);
  return u.toString();
}

/** Push Shopee: header Authorization = hex(HMAC-SHA256(partner_key, URL nhận push + "|" + body gốc)). */
export function shopeePushSignature(partnerKey: string, url: string, raw: string) {
  return hmacHex(partnerKey, `${url}|${raw}`);
}
export const verifyShopeePush = (partnerKey: string, url: string, raw: string, header: string | null) => !!header && safeEq(header.trim(), shopeePushSignature(partnerKey, url, raw));

/* ───────────── TikTok Shop ───────────── */

export const TIKTOK_BASE = "https://open-api.tiktokglobalshop.com";
export const TIKTOK_AUTH_BASE = "https://auth.tiktok-shops.com";
export const TIKTOK_AUTHORIZE = "https://services.tiktokshop.com/open/authorize";
export const TIKTOK_PATHS = {
  tokenGet: "/api/v2/token/get",
  tokenRefresh: "/api/v2/token/refresh",
  shops: "/authorization/202309/shops",
  orderSearch: "/order/202309/orders/search",
  orderDetail: "/order/202309/orders",
} as const;

/**
 * Chữ ký TikTok Shop:
 *   1. Lấy mọi tham số query trừ "sign" và "access_token", sắp xếp theo tên.
 *   2. Nối path + (tên + giá trị) của từng tham số.
 *   3. Nếu có body (không phải multipart) thì nối thêm body gốc.
 *   4. Bọc app_secret ở hai đầu, rồi hex(HMAC-SHA256(app_secret, chuỗi đó)).
 */
export function tiktokSign(appSecret: string, p: { path: string; query: Record<string, string | number>; body?: string }) {
  const keys = Object.keys(p.query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let input = p.path + keys.map((k) => `${k}${p.query[k]}`).join("");
  if (p.body) input += p.body;
  return hmacHex(appSecret, `${appSecret}${input}${appSecret}`);
}

/** URL đầy đủ đã ký cho một lời gọi API shop (token đi ở header x-tts-access-token). */
export function tiktokUrl(p: { appKey: string; appSecret: string; path: string; timestamp: number; shopCipher?: string; query?: Record<string, string | number>; body?: string; baseUrl?: string }) {
  const query: Record<string, string | number> = { app_key: p.appKey, timestamp: p.timestamp, ...(p.shopCipher ? { shop_cipher: p.shopCipher } : {}), ...(p.query ?? {}) };
  const sign = tiktokSign(p.appSecret, { path: p.path, query, body: p.body });
  const u = new URL(p.path, p.baseUrl || TIKTOK_BASE);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  u.searchParams.set("sign", sign);
  return u.toString();
}

/** Link uỷ quyền: có service_id thì dùng trang mới, không thì trang cũ theo app_key. */
export function tiktokAuthUrl(p: { appKey: string; serviceId?: string; state: string; authorizeUrl?: string; authBaseUrl?: string }) {
  if (p.serviceId) {
    const u = new URL(p.authorizeUrl || TIKTOK_AUTHORIZE);
    u.searchParams.set("service_id", p.serviceId);
    u.searchParams.set("state", p.state);
    return u.toString();
  }
  const u = new URL("/oauth/authorize", p.authBaseUrl || TIKTOK_AUTH_BASE);
  u.searchParams.set("app_key", p.appKey);
  u.searchParams.set("state", p.state);
  return u.toString();
}

/** Webhook TikTok Shop: header Authorization = hex(HMAC-SHA256(app_secret, app_key + body gốc)). */
export const tiktokWebhookSignature = (appKey: string, appSecret: string, raw: string) => hmacHex(appSecret, appKey + raw);
export const verifyTiktokWebhook = (appKey: string, appSecret: string, raw: string, header: string | null) => !!header && safeEq(header.trim(), tiktokWebhookSignature(appKey, appSecret, raw));
