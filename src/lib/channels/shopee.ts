// Shopee Open Platform v2: uỷ quyền shop, đổi/làm mới token, kéo đơn. Chạy thử với khoá "demo_" → đơn mẫu, không gọi mạng.
import type { ChannelAccount } from "@prisma/client";
import { credsOf, isDryRunCreds, patchCreds, type ShopeeCreds } from "./accounts";
import { SHOPEE_BASE, SHOPEE_PATHS, shopeeAuthUrl, shopeeQuery } from "./shop-sign";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class ShopError extends Error {
  constructor(
    message: string,
    public code = "",
  ) {
    super(message);
  }
}

const now = () => Math.floor(Date.now() / 1000);
const base = (c: ShopeeCreds) => c.baseUrl || process.env.SHOPEE_BASE_URL || SHOPEE_BASE;

async function call<T = Json>(c: ShopeeCreds, method: "GET" | "POST", path: string, opts: { shop?: boolean; query?: Record<string, string | number>; body?: Json } = {}): Promise<T> {
  if (!c.partnerId || !c.partnerKey) throw new ShopError("Chưa điền Partner ID / Partner Key của ứng dụng Shopee.");
  if (opts.shop && (!c.accessToken || !c.shopId)) throw new ShopError("Shop chưa được uỷ quyền (thiếu access token). Bấm “Kết nối qua Shopee”.");
  const q = shopeeQuery(c.partnerKey, { partnerId: c.partnerId, path, timestamp: now(), ...(opts.shop ? { accessToken: c.accessToken, shopId: c.shopId } : {}) });
  const u = new URL(path, base(c));
  for (const [k, v] of Object.entries({ ...q, ...(opts.query ?? {}) })) u.searchParams.set(k, String(v));
  const res = await fetch(u, {
    method,
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  }).catch((e) => {
    throw new ShopError(`Không kết nối được Shopee (${e instanceof Error && e.name === "TimeoutError" ? "quá thời gian chờ" : "mất mạng"}).`);
  });
  const j = (await res.json().catch(() => ({}))) as Json;
  if (j.error) throw new ShopError(explain(String(j.error), String(j.message ?? "")), String(j.error));
  if (!res.ok) throw new ShopError(`Shopee báo lỗi HTTP ${res.status}`);
  return j as T;
}

function explain(code: string, msg: string) {
  if (/invalid_acceess_token|invalid_access_token|error_auth/.test(code)) return "Access token Shopee hết hạn hoặc sai. CRM sẽ tự làm mới; nếu vẫn lỗi hãy uỷ quyền lại.";
  if (/error_sign/.test(code)) return "Sai chữ ký Shopee: kiểm tra Partner ID / Partner Key.";
  if (/error_param/.test(code)) return `Tham số không hợp lệ: ${msg}`;
  if (/error_permission/.test(code)) return "Ứng dụng chưa được cấp quyền đọc đơn của shop.";
  return `Shopee báo lỗi ${code}${msg ? `: ${msg}` : ""}`;
}

export function shopeeConnectUrl(a: ChannelAccount, redirect: string) {
  const c = credsOf("shopee", a);
  return shopeeAuthUrl({ partnerId: c.partnerId, partnerKey: c.partnerKey, redirect, timestamp: now(), baseUrl: base(c) });
}

type TokenRes = { access_token?: string; refresh_token?: string; expire_in?: number; shop_id?: number };
const tokenPatch = (j: TokenRes, shopId: string) => ({
  shopId,
  accessToken: j.access_token ?? "",
  refreshToken: j.refresh_token ?? "",
  expiresAt: new Date(Date.now() + (Number(j.expire_in) || 14400) * 1000).toISOString(),
  // Refresh token Shopee sống 30 ngày.
  refreshExpiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
});

/** Đổi code (sau khi chủ shop uỷ quyền) lấy access/refresh token. */
export async function shopeeExchangeCode(a: ChannelAccount, code: string, shopId: string) {
  const c = credsOf("shopee", a);
  if (isDryRunCreds("shopee", a)) return tokenPatch({ access_token: "demo_shopee_access", refresh_token: "demo_shopee_refresh", expire_in: 14400 }, shopId);
  const j = await call<TokenRes>(c, "POST", SHOPEE_PATHS.tokenGet, { body: { code, shop_id: Number(shopId), partner_id: Number(c.partnerId) } });
  return tokenPatch(j, shopId);
}

/** Làm mới token khi còn dưới 30 phút. Lưu token mới vào tài khoản. */
export async function shopeeEnsureToken(a: ChannelAccount): Promise<ShopeeCreds> {
  const c = credsOf("shopee", a);
  if (isDryRunCreds("shopee", a)) return c;
  const exp = c.expiresAt ? new Date(c.expiresAt).getTime() : 0;
  if (c.accessToken && exp - Date.now() > 30 * 60e3) return c;
  if (!c.refreshToken) throw new ShopError("Shop chưa được uỷ quyền hoặc token đã hết hạn. Bấm “Kết nối qua Shopee”.");
  const j = await call<TokenRes>(c, "POST", SHOPEE_PATHS.tokenRefresh, { body: { refresh_token: c.refreshToken, shop_id: Number(c.shopId), partner_id: Number(c.partnerId) } });
  const patch = tokenPatch(j, c.shopId);
  await patchCreds(a.id, patch);
  return { ...c, ...patch };
}

/** Đơn cập nhật từ `since` (Shopee giới hạn mỗi lần truy vấn tối đa 15 ngày). Trả chi tiết đơn (get_order_detail). */
export async function shopeeFetchOrders(a: ChannelAccount, since: Date): Promise<Json[]> {
  if (isDryRunCreds("shopee", a)) return demoShopeeOrders(a.accountId);
  const c = await shopeeEnsureToken(a);
  const to = now();
  const from = Math.max(Math.floor(since.getTime() / 1000), to - 15 * 86400 + 60);
  const sns: string[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const j = await call<{ response?: { order_list?: { order_sn: string }[]; more?: boolean; next_cursor?: string } }>(c, "GET", SHOPEE_PATHS.orderList, {
      shop: true,
      query: { time_range_field: "update_time", time_from: from, time_to: to, page_size: 100, cursor, response_optional_fields: "order_status" },
    });
    sns.push(...(j.response?.order_list ?? []).map((o) => o.order_sn));
    if (!j.response?.more || !j.response.next_cursor) break;
    cursor = j.response.next_cursor;
  }
  return shopeeOrderDetails(c, sns);
}

const DETAIL_FIELDS = "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,item_list,pay_time,total_amount,note";

async function shopeeOrderDetails(c: ShopeeCreds, sns: string[]): Promise<Json[]> {
  const out: Json[] = [];
  for (let i = 0; i < sns.length; i += 50) {
    const j = await call<{ response?: { order_list?: Json[] } }>(c, "GET", SHOPEE_PATHS.orderDetail, { shop: true, query: { order_sn_list: sns.slice(i, i + 50).join(","), response_optional_fields: DETAIL_FIELDS } });
    out.push(...(j.response?.order_list ?? []));
  }
  return out;
}

/** Một đơn theo mã (dùng khi nhận push trạng thái). */
export async function shopeeFetchOrder(a: ChannelAccount, orderSn: string): Promise<Json | null> {
  if (isDryRunCreds("shopee", a)) return demoShopeeOrders(a.accountId).find((o) => o.order_sn === orderSn) ?? null;
  const c = await shopeeEnsureToken(a);
  return (await shopeeOrderDetails(c, [orderSn]))[0] ?? null;
}

/** Thông tin shop: kiểm tra token khi bấm "Thử ngay". */
export async function shopeeShopInfo(a: ChannelAccount): Promise<{ name: string; simulated?: boolean }> {
  if (isDryRunCreds("shopee", a)) return { name: "", simulated: true };
  const c = await shopeeEnsureToken(a);
  const j = await call<{ shop_name?: string }>(c, "GET", SHOPEE_PATHS.shopInfo, { shop: true });
  return { name: j.shop_name ?? "" };
}

/* ───────────── Đơn mẫu (chạy thử) ───────────── */

const H = 3600;
/** 5 đơn mẫu cố định (mã đơn không đổi → đồng bộ lại không tạo trùng). Có SKU khớp sản phẩm mẫu (SR-C, KCN50). */
export function demoShopeeOrders(shopId: string): Json[] {
  const t = (h: number) => now() - h * H;
  const sfx = shopId.slice(-3);
  return [
    { order_sn: `2611DEMO${sfx}01`, order_status: "COMPLETED", create_time: t(70), update_time: t(10), total_amount: 1125000, estimated_shipping_fee: 15000, buyer_username: "lan.nguyen92", note: "", message_to_seller: "Giao giờ hành chính giúp em", recipient_address: { name: "Nguyễn Thị Lan", phone: "84912345678", full_address: "12 Trần Duy Hưng, Phường Trung Hoà, Quận Cầu Giấy, Hà Nội", state: "Hà Nội", city: "Quận Cầu Giấy", district: "Phường Trung Hoà" }, item_list: [{ item_name: "Serum Vitamin C 30ml", item_sku: "SR-C", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 690000 }, { item_name: "Kem chống nắng SPF50", item_sku: "KCN50", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 420000 }] },
    { order_sn: `2611DEMO${sfx}02`, order_status: "SHIPPED", create_time: t(30), update_time: t(5), total_amount: 855000, estimated_shipping_fee: 15000, buyer_username: "thuha_tran", message_to_seller: "", recipient_address: { name: "Trần Thu Hà", phone: "******78", full_address: "45 Nguyễn Trãi, Phường 2, Quận 5, TP. Hồ Chí Minh", state: "TP. Hồ Chí Minh", city: "Quận 5", district: "Phường 2" }, item_list: [{ item_name: "Kem chống nắng SPF50 (combo 2)", item_sku: "KCN50", model_sku: "KCN50", model_quantity_purchased: 2, model_discounted_price: 420000 }] },
    { order_sn: `2611DEMO${sfx}03`, order_status: "READY_TO_SHIP", create_time: t(8), update_time: t(7), total_amount: 365000, estimated_shipping_fee: 20000, buyer_username: "minhanh.le", message_to_seller: "Gói quà giúp mình nha", recipient_address: { name: "Lê Minh Anh", phone: "0987654321", full_address: "8 Lê Lợi, Phường Thạch Thang, Quận Hải Châu, Đà Nẵng", state: "Đà Nẵng", city: "Quận Hải Châu", district: "Phường Thạch Thang" }, item_list: [{ item_name: "Mặt nạ đất sét Hương Spa (hộp 5 miếng)", item_sku: "MN-DS5", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 345000 }] },
    { order_sn: `2611DEMO${sfx}04`, order_status: "UNPAID", create_time: t(2), update_time: t(2), total_amount: 705000, estimated_shipping_fee: 15000, buyer_username: "ngocmai.pham", message_to_seller: "", recipient_address: { name: "Phạm Ngọc Mai", phone: "******21", full_address: "102 Hùng Vương, Phường 9, TP. Vũng Tàu, Bà Rịa - Vũng Tàu", state: "Bà Rịa - Vũng Tàu", city: "TP. Vũng Tàu", district: "Phường 9" }, item_list: [{ item_name: "Serum Vitamin C 30ml", item_sku: "SR-C", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 690000 }] },
    { order_sn: `2611DEMO${sfx}05`, order_status: "CANCELLED", create_time: t(50), update_time: t(40), total_amount: 435000, estimated_shipping_fee: 15000, buyer_username: "huong.hoang", message_to_seller: "", recipient_address: { name: "Hoàng Thị Hương", phone: "******09", full_address: "3 Phan Chu Trinh, Phường Hội An, Quảng Nam", state: "Quảng Nam", city: "TP. Hội An", district: "Phường Minh An" }, item_list: [{ item_name: "Kem chống nắng SPF50", item_sku: "KCN50", model_sku: "", model_quantity_purchased: 1, model_discounted_price: 420000 }] },
  ];
}
