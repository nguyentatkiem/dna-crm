// Kiểu dùng chung cho vận chuyển (thuần, dùng được ở client).
export type ShipStatus = "created" | "picking" | "delivering" | "delivered" | "returned" | "cancelled" | "failed";
export const SHIP_STATUS: Record<ShipStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  created: { label: "Đã tạo", tone: "neutral" },
  picking: { label: "Đang lấy hàng", tone: "info" },
  delivering: { label: "Đang giao", tone: "info" },
  delivered: { label: "Đã giao", tone: "success" },
  returned: { label: "Hoàn hàng", tone: "warning" },
  cancelled: { label: "Đã huỷ", tone: "neutral" },
  failed: { label: "Lỗi", tone: "danger" },
};
export const ACTIVE_SHIP: ShipStatus[] = ["created", "picking", "delivering"];

export type CarrierKey = "demo" | "ghn" | "ghtk" | "vtp";
export const CARRIER_LABEL: Record<CarrierKey | "manual", string> = { demo: "Demo (mô phỏng)", ghn: "Giao Hàng Nhanh", ghtk: "Giao Hàng Tiết Kiệm", vtp: "Viettel Post", manual: "Tự giao" };
export const CARRIERS: CarrierKey[] = ["demo", "ghn", "ghtk", "vtp"];

export type Address = { name: string; phone: string; address: string; province: string; district: string; ward: string };
export type ShipItem = { name: string; code: string; qty: number; weightGram: number; price: number };

/** Đầu vào chung cho mọi hãng. */
export type ShipInput = {
  orderNumber: string;
  from: Address;
  to: Address;
  items: ShipItem[];
  weightGram: number;
  /** Tiền thu hộ (COD). */
  cod: number;
  /** Giá trị hàng (khai giá / bảo hiểm). */
  value: number;
  note: string;
};

export type ShipEvent = { at: string; status: ShipStatus; text: string };
export type CreateResult = { trackingCode: string; fee: number; labelUrl?: string; raw: unknown; dryRun?: boolean };
export type TrackResult = { status: ShipStatus; events: ShipEvent[]; raw?: unknown };

/** HỢP ĐỒNG adapter hãng vận chuyển. */
export interface Carrier<C = unknown> {
  key: CarrierKey;
  label: string;
  configured(cfg: C): boolean;
  quote(input: ShipInput, cfg: C): Promise<{ fee: number; note?: string }>;
  create(input: ShipInput, cfg: C): Promise<CreateResult>;
  cancel(trackingCode: string, cfg: C): Promise<{ ok: boolean; note?: string }>;
  track(trackingCode: string, cfg: C): Promise<TrackResult | null>;
  labelUrl?(trackingCode: string, cfg: C): Promise<string | null>;
}

export const shipAddressText = (a: Pick<Address, "address" | "ward" | "district" | "province">) => [a.address, a.ward, a.district, a.province].map((s) => s.trim()).filter(Boolean).join(", ");
