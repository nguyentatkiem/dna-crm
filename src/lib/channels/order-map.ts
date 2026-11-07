// Chuẩn hoá đơn Shopee / TikTok Shop → dạng chung + dòng hàng CRM. Thuần (không DB), có kiểm thử.
import type { Product } from "@prisma/client";
import { totals, type Line } from "../sales/lines";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type ShopChannel = "shopee" | "tiktok";
export type CrmOrderStatus = "new" | "confirmed" | "shipping" | "done" | "cancelled";

/** Đơn sàn đã chuẩn hoá (thuần). */
export type ShopOrder = {
  channel: ShopChannel;
  externalId: string;
  rawStatus: string;
  status: CrmOrderStatus;
  /** Sàn đã thu tiền của người mua (không còn UNPAID, chưa huỷ). */
  paid: boolean;
  createdAt: Date | null;
  buyerName: string;
  /** "" nếu sàn che số (******78). */
  phone: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  note: string;
  total: number;
  shippingFee: number;
  items: { sku: string; name: string; qty: number; price: number }[];
};

/* ───────────── Trạng thái ───────────── */

const SHOPEE_STATUS: Record<string, CrmOrderStatus> = {
  UNPAID: "new",
  READY_TO_SHIP: "confirmed",
  PROCESSED: "confirmed",
  RETRY_SHIP: "confirmed",
  SHIPPED: "shipping",
  TO_CONFIRM_RECEIVE: "shipping",
  COMPLETED: "done",
  IN_CANCEL: "cancelled",
  CANCELLED: "cancelled",
  TO_RETURN: "cancelled",
};
const TIKTOK_STATUS: Record<string, CrmOrderStatus> = {
  UNPAID: "new",
  ON_HOLD: "new",
  PARTIALLY_SHIPPING: "shipping",
  AWAITING_SHIPMENT: "confirmed",
  AWAITING_COLLECTION: "confirmed",
  IN_TRANSIT: "shipping",
  DELIVERED: "done",
  COMPLETED: "done",
  CANCELLED: "cancelled",
};

export function mapShopStatus(channel: ShopChannel, raw: string): CrmOrderStatus {
  const s = raw.toUpperCase();
  return (channel === "shopee" ? SHOPEE_STATUS : TIKTOK_STATUS)[s] ?? "new";
}

/** Như normPhone của Hub nguồn khách: +84 912… / 84912… → 0912…; số bị sàn che (******78) → "". */
export function unmask(p: string) {
  if (/\*/.test(p)) return "";
  let d = p.replace(/\D/g, "");
  if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d.length >= 9 && d.length <= 11 ? d : "";
}

/* ───────────── Chuẩn hoá đơn ───────────── */

export function mapShopeeOrder(o: Json): ShopOrder {
  const raw = str(o.order_status);
  const status = mapShopStatus("shopee", raw);
  const a: Json = o.recipient_address ?? {};
  return {
    channel: "shopee",
    externalId: str(o.order_sn),
    rawStatus: raw,
    status,
    paid: raw !== "UNPAID" && status !== "cancelled",
    createdAt: num(o.create_time) ? new Date(num(o.create_time) * 1000) : null,
    buyerName: str(a.name) || str(o.buyer_username) || "Người mua Shopee",
    phone: unmask(str(a.phone)),
    address: str(a.full_address),
    // Shopee VN: state = tỉnh/thành, city = quận/huyện, district (hoặc town) = phường/xã.
    province: str(a.state),
    district: str(a.city),
    ward: str(a.district) || str(a.town),
    note: [str(o.message_to_seller), str(o.note)].filter(Boolean).join(" · "),
    total: num(o.total_amount),
    shippingFee: num(o.actual_shipping_fee) || num(o.estimated_shipping_fee),
    items: (o.item_list ?? []).map((i: Json) => ({
      sku: str(i.model_sku) || str(i.item_sku),
      name: [str(i.item_name), str(i.model_name)].filter(Boolean).join(" – "),
      qty: num(i.model_quantity_purchased) || 1,
      price: num(i.model_discounted_price) || num(i.model_original_price),
    })),
  };
}

export function mapTiktokOrder(o: Json): ShopOrder {
  const raw = str(o.status);
  const status = mapShopStatus("tiktok", raw);
  const a: Json = o.recipient_address ?? {};
  const lvl = (n: string) => str((a.district_info ?? []).find((d: Json) => str(d.address_level) === n)?.address_name);
  // API 202309: mỗi line_item là một đơn vị hàng → gộp theo SKU + tên + giá.
  const map = new Map<string, ShopOrder["items"][number]>();
  for (const li of o.line_items ?? []) {
    const sku = str(li.seller_sku);
    const name = [str(li.product_name), str(li.sku_name)].filter(Boolean).join(" – ");
    const price = num(li.sale_price) || num(li.original_price);
    const key = `${sku}|${name}|${price}`;
    const cur = map.get(key);
    const q = num(li.quantity) || 1;
    if (cur) cur.qty += q;
    else map.set(key, { sku, name, qty: q, price });
  }
  const p: Json = o.payment ?? {};
  return {
    channel: "tiktok",
    externalId: str(o.id),
    rawStatus: raw,
    status,
    paid: raw !== "UNPAID" && raw !== "ON_HOLD" && status !== "cancelled",
    createdAt: num(o.create_time) ? new Date(num(o.create_time) * 1000) : null,
    buyerName: str(a.name) || "Người mua TikTok Shop",
    phone: unmask(str(a.phone_number).replace(/^\(\+?84\)/, "0")),
    address: str(a.full_address) || str(a.address_detail),
    province: lvl("L1"),
    district: lvl("L2"),
    ward: lvl("L3"),
    note: str(o.buyer_message),
    total: num(p.total_amount),
    shippingFee: num(p.shipping_fee),
    items: [...map.values()],
  };
}

type ProductLite = Pick<Product, "id" | "code" | "sku" | "name" | "unit" | "vat">;

/**
 * Dòng hàng CRM: khớp sản phẩm theo SKU (Product.sku, không có thì Product.code), không khớp thì dòng tự do.
 * Chênh lệch với tổng tiền sàn: dương → thêm dòng "Phí vận chuyển (sàn)", âm → chiết khấu đơn. Tổng CRM = tổng sàn.
 * VAT để 0 (giá sàn đã gồm thuế).
 */
export function buildLines(o: ShopOrder, products: ProductLite[]): { lines: Line[]; discount: number; matched: number } {
  const bySku = new Map<string, ProductLite>();
  for (const p of products) if (p.code) bySku.set(p.code.toLowerCase(), p);
  for (const p of products) if (p.sku) bySku.set(p.sku.toLowerCase(), p);
  let matched = 0;
  const lines: Line[] = o.items.map((i) => {
    const p = i.sku ? bySku.get(i.sku.toLowerCase()) : undefined;
    if (p) matched++;
    return { productId: p?.id, code: p?.code || i.sku, name: p ? p.name : i.name || i.sku || "Sản phẩm sàn", unit: p?.unit || "cái", qty: i.qty, price: Math.round(i.price), discountPct: 0, vatPct: 0 };
  });
  const sub = totals(lines).subtotal;
  const diff = Math.round(o.total) - sub;
  let discount = 0;
  if (o.total > 0 && diff > 0) lines.push({ code: "SHIP", name: "Phí vận chuyển (sàn)", unit: "lần", qty: 1, price: diff, discountPct: 0, vatPct: 0 });
  else if (o.total > 0 && diff < 0) discount = -diff;
  return { lines, discount, matched };
}

export const mapShopOrder = (channel: ShopChannel, raw: Json) => (channel === "shopee" ? mapShopeeOrder(raw) : mapTiktokOrder(raw));

const RANK: Record<string, number> = { new: 0, confirmed: 1, shipping: 2, done: 3 };

/**
 * Trạng thái mới khi sàn báo lại một đơn đã có (null = giữ nguyên). Chỉ tiến lên (Mới → Đã xác nhận → Đang giao → Hoàn tất)
 * hoặc huỷ khi đơn chưa hoàn tất; không kéo lùi đơn mà nhân viên đã xử lý tiếp trên CRM (vd. đã tạo vận đơn / hoàn tất),
 * không hồi sinh đơn đã huỷ — tránh trả kho / trừ kho lặp mỗi lần đồng bộ.
 */
export function shopStatusUpdate(cur: string, incoming: string): string | null {
  if (cur === incoming || cur === "cancelled") return null;
  if (incoming === "cancelled") return cur === "done" ? null : "cancelled";
  const a = RANK[cur];
  const b = RANK[incoming];
  if (a === undefined || b === undefined) return null;
  return b > a ? incoming : null;
}
