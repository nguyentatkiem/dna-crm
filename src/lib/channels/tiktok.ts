// TikTok Shop Open API (phiên bản 202309): uỷ quyền, đổi/làm mới token, lấy shop_cipher, kéo đơn.
// Chạy thử với khoá "demo_" → đơn mẫu, không gọi mạng.
import type { ChannelAccount } from "@prisma/client";
import { credsOf, isDryRunCreds, patchCreds, type TiktokCreds } from "./accounts";
import { ShopError } from "./shopee";
import { TIKTOK_AUTH_BASE, TIKTOK_BASE, TIKTOK_PATHS, tiktokAuthUrl, tiktokUrl } from "./shop-sign";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const now = () => Math.floor(Date.now() / 1000);
const base = (c: TiktokCreds) => c.baseUrl || process.env.TIKTOK_SHOP_BASE_URL || TIKTOK_BASE;
const authBase = (c: TiktokCreds) => c.authBaseUrl || process.env.TIKTOK_SHOP_AUTH_URL || TIKTOK_AUTH_BASE;

type Res<T> = { code?: number; message?: string; data?: T };

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }).catch((e) => {
    throw new ShopError(`Không kết nối được TikTok Shop (${e instanceof Error && e.name === "TimeoutError" ? "quá thời gian chờ" : "mất mạng"}).`);
  });
  const j = (await res.json().catch(() => ({}))) as Res<T>;
  if (j.code !== 0 && j.code !== undefined) throw new ShopError(explain(j.code, j.message ?? ""), String(j.code));
  if (!res.ok) throw new ShopError(`TikTok Shop báo lỗi HTTP ${res.status}`);
  return (j.data ?? {}) as T;
}

function explain(code: number, msg: string) {
  if (code === 105002 || code === 105001 || code === 36004004) return "Access token TikTok Shop hết hạn hoặc sai. CRM sẽ tự làm mới; nếu vẫn lỗi hãy uỷ quyền lại.";
  if (code === 106001 || /sign/i.test(msg)) return "Sai chữ ký TikTok Shop: kiểm tra App Key / App Secret.";
  if (code === 105005) return "Ứng dụng chưa được cấp quyền đọc đơn của shop.";
  return `TikTok Shop báo lỗi ${code}${msg ? `: ${msg}` : ""}`;
}

async function api<T>(c: TiktokCreds, method: "GET" | "POST", path: string, query: Record<string, string | number> = {}, body?: Json): Promise<T> {
  if (!c.appKey || !c.appSecret) throw new ShopError("Chưa điền App Key / App Secret của ứng dụng TikTok Shop.");
  if (!c.accessToken) throw new ShopError("Shop chưa được uỷ quyền (thiếu access token). Bấm “Kết nối qua TikTok Shop”.");
  const raw = body ? JSON.stringify(body) : undefined;
  const url = tiktokUrl({ appKey: c.appKey, appSecret: c.appSecret, path, timestamp: now(), shopCipher: path.startsWith("/authorization/") ? undefined : c.shopCipher, query, body: raw, baseUrl: base(c) });
  return send<T>(url, { method, headers: { "x-tts-access-token": c.accessToken, "Content-Type": "application/json" }, body: raw });
}

export function tiktokConnectUrl(a: ChannelAccount, state: string) {
  const c = credsOf("tiktok", a);
  return tiktokAuthUrl({ appKey: c.appKey, serviceId: c.serviceId, state, authBaseUrl: authBase(c) });
}

type TokenData = { access_token?: string; access_token_expire_in?: number; refresh_token?: string; refresh_token_expire_in?: number; seller_name?: string; open_id?: string };
// TikTok trả thời điểm hết hạn (unix giây), không phải số giây còn lại.
const tsIso = (v: unknown, fallbackSec: number) => new Date((Number(v) > 1e9 ? Number(v) : now() + fallbackSec) * 1000).toISOString();
const tokenPatch = (d: TokenData) => ({
  accessToken: d.access_token ?? "",
  refreshToken: d.refresh_token ?? "",
  expiresAt: tsIso(d.access_token_expire_in, 7 * 86400),
  refreshExpiresAt: tsIso(d.refresh_token_expire_in, 30 * 86400),
});

async function tokenCall(c: TiktokCreds, path: string, q: Record<string, string>) {
  const u = new URL(path, authBase(c));
  for (const [k, v] of Object.entries({ app_key: c.appKey, app_secret: c.appSecret, ...q })) u.searchParams.set(k, v);
  return send<TokenData>(u.toString(), { method: "GET" });
}

/** Đổi auth_code lấy token, rồi lấy shop_id + shop_cipher của shop vừa uỷ quyền. */
export async function tiktokExchangeCode(a: ChannelAccount, code: string) {
  const c = credsOf("tiktok", a);
  if (isDryRunCreds("tiktok", a)) return { ...tokenPatch({ access_token: "demo_tts_access", refresh_token: "demo_tts_refresh" }), shopId: c.shopId || "7000000000001", shopCipher: "demo_cipher", sellerName: "" };
  const d = await tokenCall(c, TIKTOK_PATHS.tokenGet, { auth_code: code, grant_type: "authorized_code" });
  const patch = tokenPatch(d);
  const shops = await api<{ shops?: { id?: string; cipher?: string; name?: string }[] }>({ ...c, ...patch }, "GET", TIKTOK_PATHS.shops);
  const s = shops.shops?.[0] ?? {};
  return { ...patch, shopId: String(s.id ?? c.shopId ?? ""), shopCipher: String(s.cipher ?? ""), sellerName: s.name ?? d.seller_name ?? "" };
}

/** Làm mới token khi còn dưới 1 giờ. */
export async function tiktokEnsureToken(a: ChannelAccount): Promise<TiktokCreds> {
  const c = credsOf("tiktok", a);
  if (isDryRunCreds("tiktok", a)) return c;
  const exp = c.expiresAt ? new Date(c.expiresAt).getTime() : 0;
  if (c.accessToken && exp - Date.now() > 3600e3) return c;
  if (!c.refreshToken) throw new ShopError("Shop chưa được uỷ quyền hoặc token đã hết hạn. Bấm “Kết nối qua TikTok Shop”.");
  const patch = tokenPatch(await tokenCall(c, TIKTOK_PATHS.tokenRefresh, { refresh_token: c.refreshToken, grant_type: "refresh_token" }));
  await patchCreds(a.id, patch);
  return { ...c, ...patch };
}

/** Đơn cập nhật từ `since` (orders/search trả đầy đủ chi tiết đơn). */
export async function tiktokFetchOrders(a: ChannelAccount, since: Date): Promise<Json[]> {
  if (isDryRunCreds("tiktok", a)) return demoTiktokOrders(a.accountId);
  const c = await tiktokEnsureToken(a);
  const out: Json[] = [];
  let token = "";
  for (let page = 0; page < 20; page++) {
    const d = await api<{ orders?: Json[]; next_page_token?: string }>(c, "POST", TIKTOK_PATHS.orderSearch, { page_size: 50, sort_field: "update_time", sort_order: "ASC", ...(token ? { page_token: token } : {}) }, { update_time_ge: Math.floor(since.getTime() / 1000), update_time_lt: now() });
    out.push(...(d.orders ?? []));
    if (!d.next_page_token) break;
    token = d.next_page_token;
  }
  return out;
}

export async function tiktokFetchOrder(a: ChannelAccount, orderId: string): Promise<Json | null> {
  if (isDryRunCreds("tiktok", a)) return demoTiktokOrders(a.accountId).find((o) => o.id === orderId) ?? null;
  const c = await tiktokEnsureToken(a);
  const d = await api<{ orders?: Json[] }>(c, "GET", TIKTOK_PATHS.orderDetail, { ids: orderId });
  return d.orders?.[0] ?? null;
}

export async function tiktokShops(a: ChannelAccount): Promise<{ name: string; simulated?: boolean }> {
  if (isDryRunCreds("tiktok", a)) return { name: "", simulated: true };
  const c = await tiktokEnsureToken(a);
  const d = await api<{ shops?: { name?: string }[] }>(c, "GET", TIKTOK_PATHS.shops);
  return { name: d.shops?.[0]?.name ?? "" };
}

/* ───────────── Đơn mẫu (chạy thử) ───────────── */

const addr = (name: string, phone: string, full: string, province: string, district: string, ward: string) => ({
  name,
  phone_number: phone,
  full_address: full,
  district_info: [
    { address_level: "L0", address_level_name: "Country", address_name: "Việt Nam" },
    { address_level: "L1", address_level_name: "Province", address_name: province },
    { address_level: "L2", address_level_name: "District", address_name: district },
    { address_level: "L3", address_level_name: "Ward", address_name: ward },
  ],
});
const item = (sku: string, name: string, price: number) => ({ seller_sku: sku, product_name: name, sku_name: "", sale_price: String(price), original_price: String(price) });

/** 5 đơn mẫu cố định; mỗi line_item là một đơn vị hàng như API 202309. */
export function demoTiktokOrders(shopId: string): Json[] {
  const t = (h: number) => now() - h * 3600;
  const sfx = shopId.slice(-3);
  return [
    { id: `57700${sfx}0001`, status: "COMPLETED", create_time: t(96), update_time: t(20), buyer_message: "", payment: { currency: "VND", total_amount: "1395000", sub_total: "1380000", shipping_fee: "15000" }, recipient_address: addr("Vũ Thanh Tâm", "(+84)903111222", "25 Lý Thường Kiệt, Phường Hàng Bài, Quận Hoàn Kiếm, Hà Nội", "Hà Nội", "Quận Hoàn Kiếm", "Phường Hàng Bài"), line_items: [item("SR-C", "Serum Vitamin C 30ml", 690000), item("SR-C", "Serum Vitamin C 30ml", 690000)] },
    { id: `57700${sfx}0002`, status: "IN_TRANSIT", create_time: t(26), update_time: t(3), buyer_message: "Giao buổi tối", payment: { currency: "VND", total_amount: "435000", sub_total: "420000", shipping_fee: "15000" }, recipient_address: addr("Đặng Mỹ Linh", "(+84)9*******34", "88 Võ Văn Tần, Phường 6, Quận 3, TP. Hồ Chí Minh", "TP. Hồ Chí Minh", "Quận 3", "Phường 6"), line_items: [item("KCN50", "Kem chống nắng SPF50", 420000)] },
    { id: `57700${sfx}0003`, status: "AWAITING_SHIPMENT", create_time: t(6), update_time: t(5), buyer_message: "", payment: { currency: "VND", total_amount: "280000", sub_total: "300000", shipping_fee: "0", seller_discount: "20000" }, recipient_address: addr("Bùi Phương Thảo", "(+84)356789123", "17 Trần Phú, Phường Lộc Thọ, TP. Nha Trang, Khánh Hoà", "Khánh Hoà", "TP. Nha Trang", "Phường Lộc Thọ"), line_items: [item("SRM-TT", "Sữa rửa mặt trà xanh 150ml", 150000), item("SRM-TT", "Sữa rửa mặt trà xanh 150ml", 150000)] },
    { id: `57700${sfx}0004`, status: "UNPAID", create_time: t(1), update_time: t(1), buyer_message: "", payment: { currency: "VND", total_amount: "705000", sub_total: "690000", shipping_fee: "15000" }, recipient_address: addr("Đỗ Khánh Vy", "(+84)9*******56", "5 Nguyễn Văn Cừ, Phường An Khánh, Quận Ninh Kiều, Cần Thơ", "Cần Thơ", "Quận Ninh Kiều", "Phường An Khánh"), line_items: [item("SR-C", "Serum Vitamin C 30ml", 690000)] },
    { id: `57700${sfx}0005`, status: "CANCELLED", create_time: t(48), update_time: t(47), buyer_message: "", payment: { currency: "VND", total_amount: "435000", sub_total: "420000", shipping_fee: "15000" }, recipient_address: addr("Ngô Bảo Ngọc", "(+84)9*******90", "9 Lê Duẩn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh", "TP. Hồ Chí Minh", "Quận 1", "Phường Bến Nghé"), line_items: [item("KCN50", "Kem chống nắng SPF50", 420000)] },
  ];
}
