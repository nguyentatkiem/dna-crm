// Adapter các hãng vận chuyển: GHN (API v2), GHTK (services.giaohangtietkiem.vn), Viettel Post (partner.viettelpost.vn), Demo.
// Phần dựng request là hàm thuần (kiểm thử được); phần gọi mạng bị chặn khi PAY_DRY_RUN=1 hoặc khi chạy kiểm thử.
import { randomBytes } from "node:crypto";
import { payDryRun } from "@/lib/pay/settings";
import type { GhnCfg, GhtkCfg, VtpCfg } from "./settings";
import { shipAddressText, type Carrier, type CarrierKey, type CreateResult, type ShipInput, type ShipStatus, type TrackResult } from "./types";

type Req = { method: "GET" | "POST"; url: string; headers: Record<string, string>; body?: unknown };

async function send<T>(r: Req): Promise<T> {
  if (payDryRun()) throw new Error("DRY_RUN");
  const res = await fetch(r.url, { method: r.method, headers: { "Content-Type": "application/json", ...r.headers }, body: r.body === undefined ? undefined : JSON.stringify(r.body), signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let j: unknown = null;
  try {
    j = JSON.parse(text);
  } catch {
    j = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${errText(j)}`);
  return j as T;
}
const errText = (j: unknown) => {
  const o = (j ?? {}) as Record<string, unknown>;
  return String(o.message ?? o.code_message_value ?? o.error ?? o.raw ?? "").slice(0, 300) || "không rõ";
};
const dryCode = (p: string) => `${p}${randomBytes(4).toString("hex").toUpperCase()}`;
const isDry = (e: unknown) => e instanceof Error && e.message === "DRY_RUN";
const nowIso = () => new Date().toISOString();

// ======================= GHN =======================

const ghnBase = (c: GhnCfg) => (c.env === "dev" ? "https://dev-online-gateway.ghn.vn" : "https://online-gateway.ghn.vn");
const ghnHeaders = (c: GhnCfg) => ({ Token: c.token, ShopId: String(c.shopId) });

/** Body tạo đơn GHN v2 (dùng tên tỉnh/quận/phường; GHN tự khớp mã). */
export function ghnOrderBody(i: ShipInput, c: GhnCfg) {
  return {
    payment_type_id: c.paymentTypeId || 1,
    note: i.note.slice(0, 500),
    required_note: c.requiredNote || "KHONGCHOXEMHANG",
    client_order_code: i.orderNumber,
    from_name: i.from.name,
    from_phone: i.from.phone,
    from_address: i.from.address,
    from_ward_name: i.from.ward,
    from_district_name: i.from.district,
    from_province_name: i.from.province,
    to_name: i.to.name,
    to_phone: i.to.phone,
    to_address: shipAddressText(i.to),
    to_ward_name: i.to.ward,
    to_district_name: i.to.district,
    to_province_name: i.to.province,
    cod_amount: Math.round(i.cod),
    insurance_value: Math.min(Math.round(i.value), 5_000_000),
    weight: Math.max(1, Math.round(i.weightGram)),
    length: 20,
    width: 15,
    height: 10,
    service_type_id: c.serviceTypeId || 2,
    items: i.items.map((x) => ({ name: x.name.slice(0, 200), code: x.code, quantity: Math.max(1, Math.round(x.qty)), price: Math.round(x.price), weight: Math.max(1, Math.round(x.weightGram)) })),
  };
}

export function ghnStatus(s: string): ShipStatus {
  const v = s.toLowerCase();
  if (v === "ready_to_pick") return "created";
  if (v === "picking" || v === "money_collect_picking") return "picking";
  if (v === "delivered") return "delivered";
  if (v === "cancel") return "cancelled";
  if (v === "returned" || v.startsWith("return") || v === "waiting_to_return") return "returned";
  if (v === "exception" || v === "damage" || v === "lost") return "failed";
  return "delivering";
}

const ghn: Carrier<GhnCfg> = {
  key: "ghn",
  label: "Giao Hàng Nhanh",
  configured: (c) => !!(c.token && c.shopId),
  async quote(i, c) {
    try {
      const j = await send<{ data?: { total_fee?: number } }>({ method: "POST", url: `${ghnBase(c)}/shiip/public-api/v2/shipping-order/preview`, headers: ghnHeaders(c), body: ghnOrderBody(i, c) });
      return { fee: Number(j.data?.total_fee ?? 0) };
    } catch (e) {
      if (isDry(e)) return { fee: 30000, note: "Chạy khô – phí ước tính, chưa hỏi GHN" };
      throw e;
    }
  },
  async create(i, c): Promise<CreateResult> {
    try {
      const j = await send<{ code?: number; message?: string; data?: { order_code?: string; total_fee?: number } }>({ method: "POST", url: `${ghnBase(c)}/shiip/public-api/v2/shipping-order/create`, headers: ghnHeaders(c), body: ghnOrderBody(i, c) });
      if (!j.data?.order_code) throw new Error(j.message || "GHN không trả mã vận đơn");
      return { trackingCode: j.data.order_code, fee: Number(j.data.total_fee ?? 0), raw: j };
    } catch (e) {
      if (isDry(e)) return { trackingCode: dryCode("DRYGHN"), fee: 30000, raw: { dryRun: true }, dryRun: true };
      throw e;
    }
  },
  async cancel(code, c) {
    try {
      await send({ method: "POST", url: `${ghnBase(c)}/shiip/public-api/v2/switch-status/cancel`, headers: ghnHeaders(c), body: { order_codes: [code] } });
      return { ok: true };
    } catch (e) {
      if (isDry(e)) return { ok: true, note: "Chạy khô" };
      throw e;
    }
  },
  async track(code, c): Promise<TrackResult | null> {
    try {
      const j = await send<{ data?: { status?: string; log?: { status: string; updated_date: string }[] } }>({ method: "POST", url: `${ghnBase(c)}/shiip/public-api/v2/shipping-order/detail`, headers: ghnHeaders(c), body: { order_code: code } });
      if (!j.data?.status) return null;
      return { status: ghnStatus(j.data.status), events: (j.data.log ?? []).map((l) => ({ at: l.updated_date, status: ghnStatus(l.status), text: `GHN: ${l.status}` })), raw: j.data };
    } catch (e) {
      if (isDry(e)) return null;
      throw e;
    }
  },
  async labelUrl(code, c) {
    try {
      const j = await send<{ data?: { token?: string } }>({ method: "POST", url: `${ghnBase(c)}/shiip/public-api/v2/a5/gen-token`, headers: ghnHeaders(c), body: { order_codes: [code] } });
      return j.data?.token ? `${ghnBase(c)}/a5/public-api/printA5?token=${encodeURIComponent(j.data.token)}` : null;
    } catch {
      return null;
    }
  },
};

// ======================= GHTK =======================

const ghtkBase = (c: GhtkCfg) => (c.env === "staging" ? "https://services-staging.ghtklab.com" : "https://services.giaohangtietkiem.vn");
const ghtkHeaders = (c: GhtkCfg) => ({ Token: c.token, ...(c.clientSource ? { "X-Client-Source": c.clientSource } : {}) });

/** Body tạo đơn GHTK (/services/shipment/order/?ver=1.5): khối lượng sản phẩm tính bằng kg. */
export function ghtkOrderBody(i: ShipInput, c: GhtkCfg) {
  return {
    products: i.items.map((x) => ({ name: x.name.slice(0, 200), weight: Math.max(0.01, Math.round(x.weightGram) / 1000), quantity: Math.max(1, Math.round(x.qty)), product_code: x.code || undefined, price: Math.round(x.price) })),
    order: {
      id: i.orderNumber,
      pick_name: i.from.name,
      pick_address: i.from.address,
      pick_province: i.from.province,
      pick_district: i.from.district,
      pick_ward: i.from.ward || undefined,
      pick_tel: i.from.phone,
      tel: i.to.phone,
      name: i.to.name,
      address: i.to.address,
      province: i.to.province,
      district: i.to.district,
      ward: i.to.ward || undefined,
      hamlet: "Khác",
      is_freeship: "1",
      pick_money: Math.round(i.cod),
      note: i.note.slice(0, 120),
      value: Math.round(i.value),
      transport: c.transport || "road",
      pick_option: "cod",
    },
  };
}

export function ghtkFeeQuery(i: ShipInput, c: GhtkCfg) {
  return new URLSearchParams({ pick_province: i.from.province, pick_district: i.from.district, province: i.to.province, district: i.to.district, address: i.to.address, weight: String(Math.max(1, Math.round(i.weightGram))), value: String(Math.round(i.value)), transport: c.transport || "road", deliver_option: "none" });
}

/** Mã trạng thái GHTK (status_id) → trạng thái chung. */
export function ghtkStatus(id: number | string): ShipStatus {
  const n = Number(id);
  if (n === -1) return "cancelled";
  if (n === 1 || n === 2) return "created";
  if ([12, 8, 128].includes(n)) return "picking";
  if ([5, 6, 45].includes(n)) return "delivered";
  if ([20, 21, 11, 13].includes(n)) return "returned";
  if ([7, 127].includes(n)) return "failed";
  return "delivering";
}

const ghtk: Carrier<GhtkCfg> = {
  key: "ghtk",
  label: "Giao Hàng Tiết Kiệm",
  configured: (c) => !!c.token,
  async quote(i, c) {
    try {
      const j = await send<{ success?: boolean; message?: string; fee?: { fee?: number; delivery?: boolean } }>({ method: "GET", url: `${ghtkBase(c)}/services/shipment/fee?${ghtkFeeQuery(i, c)}`, headers: ghtkHeaders(c) });
      if (!j.success) throw new Error(j.message || "GHTK không báo được phí");
      return { fee: Number(j.fee?.fee ?? 0), note: j.fee?.delivery === false ? "GHTK chưa hỗ trợ giao tới địa chỉ này" : undefined };
    } catch (e) {
      if (isDry(e)) return { fee: 25000, note: "Chạy khô – phí ước tính, chưa hỏi GHTK" };
      throw e;
    }
  },
  async create(i, c) {
    try {
      const j = await send<{ success?: boolean; message?: string; order?: { label?: string; fee?: number | string } }>({ method: "POST", url: `${ghtkBase(c)}/services/shipment/order/?ver=1.5`, headers: ghtkHeaders(c), body: ghtkOrderBody(i, c) });
      if (!j.success || !j.order?.label) throw new Error(j.message || "GHTK không trả mã vận đơn");
      return { trackingCode: j.order.label, fee: Number(j.order.fee ?? 0), raw: j };
    } catch (e) {
      if (isDry(e)) return { trackingCode: dryCode("DRYGHTK"), fee: 25000, raw: { dryRun: true }, dryRun: true };
      throw e;
    }
  },
  async cancel(code, c) {
    try {
      const j = await send<{ success?: boolean; message?: string }>({ method: "POST", url: `${ghtkBase(c)}/services/shipment/cancel/${encodeURIComponent(code)}`, headers: ghtkHeaders(c) });
      return { ok: !!j.success, note: j.message };
    } catch (e) {
      if (isDry(e)) return { ok: true, note: "Chạy khô" };
      throw e;
    }
  },
  async track(code, c) {
    try {
      const j = await send<{ success?: boolean; order?: { status?: number | string; status_text?: string; modified?: string } }>({ method: "GET", url: `${ghtkBase(c)}/services/shipment/v2/${encodeURIComponent(code)}`, headers: ghtkHeaders(c) });
      if (!j.success || j.order?.status == null) return null;
      const st = ghtkStatus(j.order.status);
      return { status: st, events: [{ at: j.order.modified ? new Date(j.order.modified.replace(" ", "T") + "+07:00").toISOString() : nowIso(), status: st, text: `GHTK: ${j.order.status_text ?? j.order.status}` }], raw: j.order };
    } catch (e) {
      if (isDry(e)) return null;
      throw e;
    }
  },
};

// ======================= Viettel Post =======================

const VTP_BASE = "https://partner.viettelpost.vn";

/** Body tạo đơn Viettel Post (bản nhận địa chỉ dạng chữ – NLP). Mã dịch vụ / hình thức thanh toán cấu hình được. */
export function vtpOrderBody(i: ShipInput, c: VtpCfg) {
  return {
    ORDER_NUMBER: i.orderNumber,
    GROUPADDRESS_ID: c.groupAddressId ? Number(c.groupAddressId) : undefined,
    CUS_ID: c.cusId ? Number(c.cusId) : undefined,
    SENDER_FULLNAME: i.from.name,
    SENDER_ADDRESS: shipAddressText(i.from),
    SENDER_PHONE: i.from.phone,
    RECEIVER_FULLNAME: i.to.name,
    RECEIVER_ADDRESS: shipAddressText(i.to),
    RECEIVER_PHONE: i.to.phone,
    PRODUCT_NAME: i.items.map((x) => `${x.name} x${x.qty}`).join(", ").slice(0, 250),
    PRODUCT_DESCRIPTION: i.note.slice(0, 250),
    PRODUCT_QUANTITY: i.items.reduce((s, x) => s + Math.max(1, Math.round(x.qty)), 0),
    PRODUCT_PRICE: Math.round(i.value),
    PRODUCT_WEIGHT: Math.max(1, Math.round(i.weightGram)),
    PRODUCT_TYPE: "HH",
    ORDER_PAYMENT: c.orderPayment || 3,
    ORDER_SERVICE: c.service || "VCN",
    ORDER_SERVICE_ADD: "",
    ORDER_NOTE: i.note.slice(0, 250),
    MONEY_COLLECTION: Math.round(i.cod),
    LIST_ITEM: i.items.map((x) => ({ PRODUCT_NAME: x.name.slice(0, 200), PRODUCT_PRICE: Math.round(x.price), PRODUCT_WEIGHT: Math.max(1, Math.round(x.weightGram)), PRODUCT_QUANTITY: Math.max(1, Math.round(x.qty)) })),
  };
}

export function vtpStatus(code: number | string): ShipStatus {
  const n = Number(code);
  if (n === 501) return "delivered";
  if ([502, 504, 505, 515].includes(n)) return "returned";
  if ([101, 107, 201, 503].includes(n)) return "cancelled";
  if ([-100, -108, 100, 102, 103].includes(n)) return "created";
  if (n === 104) return "picking";
  return "delivering";
}

async function vtpToken(c: VtpCfg) {
  if (c.token) return c.token;
  const j = await send<{ status?: number; data?: { token?: string }; message?: string }>({ method: "POST", url: `${VTP_BASE}/v2/user/Login`, headers: {}, body: { USERNAME: c.username, PASSWORD: c.password } });
  if (!j.data?.token) throw new Error(j.message || "Viettel Post: đăng nhập không thành công");
  return j.data.token;
}

const vtp: Carrier<VtpCfg> = {
  key: "vtp",
  label: "Viettel Post",
  configured: (c) => !!(c.token || (c.username && c.password)),
  async quote(i, c) {
    try {
      const token = await vtpToken(c);
      const j = await send<{ data?: { MONEY_TOTAL?: number; GIA_CUOC?: number }[] | { MONEY_TOTAL?: number }; message?: string }>({ method: "POST", url: `${VTP_BASE}${c.pricePath}`, headers: { Token: token }, body: { ...vtpOrderBody(i, c), TYPE: 1 } });
      const d = Array.isArray(j.data) ? j.data.find((x) => x) : j.data;
      return { fee: Number((d as { MONEY_TOTAL?: number; GIA_CUOC?: number })?.MONEY_TOTAL ?? (d as { GIA_CUOC?: number })?.GIA_CUOC ?? 0) };
    } catch (e) {
      if (isDry(e)) return { fee: 28000, note: "Chạy khô – phí ước tính, chưa hỏi Viettel Post" };
      throw e;
    }
  },
  async create(i, c) {
    try {
      const token = await vtpToken(c);
      const j = await send<{ status?: number; error?: boolean; message?: string; data?: { ORDER_NUMBER?: string; MONEY_TOTAL?: number } }>({ method: "POST", url: `${VTP_BASE}${c.createPath}`, headers: { Token: token }, body: vtpOrderBody(i, c) });
      if (j.error || !j.data?.ORDER_NUMBER) throw new Error(j.message || "Viettel Post không trả mã vận đơn");
      return { trackingCode: j.data.ORDER_NUMBER, fee: Number(j.data.MONEY_TOTAL ?? 0), raw: j };
    } catch (e) {
      if (isDry(e)) return { trackingCode: dryCode("DRYVTP"), fee: 28000, raw: { dryRun: true }, dryRun: true };
      throw e;
    }
  },
  async cancel(code, c) {
    try {
      const token = await vtpToken(c);
      const j = await send<{ error?: boolean; message?: string }>({ method: "POST", url: `${VTP_BASE}/v2/order/UpdateOrder`, headers: { Token: token }, body: { TYPE: 4, ORDER_NUMBER: code, NOTE: "Huỷ từ CRM" } });
      return { ok: !j.error, note: j.message };
    } catch (e) {
      if (isDry(e)) return { ok: true, note: "Chạy khô" };
      throw e;
    }
  },
  async track() {
    // Viettel Post đẩy trạng thái qua webhook; không có API tra cứu ổn định công khai → dựa vào webhook.
    return null;
  },
};

// ======================= Demo =======================

export const DEMO_FLOW: ShipStatus[] = ["created", "picking", "delivering", "delivered"];

/** Phí demo: 22.000đ cho 1kg đầu, +5.000đ mỗi 500g tiếp theo. */
export const demoFee = (g: number) => 22000 + Math.max(0, Math.ceil((Math.max(0, g) - 1000) / 500)) * 5000;

const demo: Carrier<unknown> = {
  key: "demo",
  label: "Demo (mô phỏng)",
  configured: () => true,
  async quote(i) {
    return { fee: demoFee(i.weightGram), note: "Phí mô phỏng" };
  },
  async create(i) {
    return { trackingCode: dryCode("DEMO"), fee: demoFee(i.weightGram), raw: { demo: true }, labelUrl: undefined };
  },
  async cancel() {
    return { ok: true };
  },
  async track() {
    return null;
  },
};

export const CARRIER_IMPL: Record<CarrierKey, Carrier<never>> = { demo, ghn, ghtk, vtp } as unknown as Record<CarrierKey, Carrier<never>>;
