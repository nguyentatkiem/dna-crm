// Cài đặt vận chuyển (Pref "shipping"). Khoá bí mật che khi gửi ra trình duyệt.
import { randomBytes } from "node:crypto";
import { getPref, setPref, COMPANY_DEFAULT, type Company } from "@/lib/prefs";
import type { Address, CarrierKey } from "./types";

export type GhnCfg = { token: string; shopId: string; env: "prod" | "dev"; serviceTypeId: number; requiredNote: string; paymentTypeId: number };
export type GhtkCfg = { token: string; env: "prod" | "staging"; transport: "road" | "fly"; clientSource: string };
export type VtpCfg = { username: string; password: string; token: string; service: string; orderPayment: number; groupAddressId: string; cusId: string; createPath: string; pricePath: string };

export type ShipSettings = {
  defaultCarrier: CarrierKey;
  /** Hãng báo "đã giao" → tự chuyển đơn sang Hoàn tất. */
  autoDone: boolean;
  /** Tạo vận đơn → chuyển đơn Mới/Đã xác nhận sang Đang giao. */
  autoShipping: boolean;
  /** Khối lượng mặc định mỗi sản phẩm khi sản phẩm chưa khai báo (gram). */
  defaultWeight: number;
  from: Address;
  webhookToken: string;
  ghn: GhnCfg;
  ghtk: GhtkCfg;
  vtp: VtpCfg;
};

export const SHIP_DEFAULT: ShipSettings = {
  defaultCarrier: "demo",
  autoDone: true,
  autoShipping: true,
  defaultWeight: 300,
  from: { name: "", phone: "", address: "", province: "", district: "", ward: "" },
  webhookToken: "",
  ghn: { token: "", shopId: "", env: "prod", serviceTypeId: 2, requiredNote: "KHONGCHOXEMHANG", paymentTypeId: 1 },
  ghtk: { token: "", env: "prod", transport: "road", clientSource: "" },
  vtp: { username: "", password: "", token: "", service: "VCN", orderPayment: 3, groupAddressId: "", cusId: "", createPath: "/v2/order/createOrderNlp", pricePath: "/v2/order/getPriceAllNlp" },
};

export const SHIP_SECRETS: Record<"ghn" | "ghtk" | "vtp", string[]> = { ghn: ["token"], ghtk: ["token"], vtp: ["password", "token"] };

export async function shipSettings(workspaceId: string): Promise<ShipSettings> {
  const s = await getPref<ShipSettings>(workspaceId, "shipping", SHIP_DEFAULT);
  const merged: ShipSettings = { ...SHIP_DEFAULT, ...s, from: { ...SHIP_DEFAULT.from, ...s.from }, ghn: { ...SHIP_DEFAULT.ghn, ...s.ghn }, ghtk: { ...SHIP_DEFAULT.ghtk, ...s.ghtk }, vtp: { ...SHIP_DEFAULT.vtp, ...s.vtp } };
  if (!merged.from.name || !merged.from.address) {
    const c = await getPref<Company>(workspaceId, "company", COMPANY_DEFAULT);
    merged.from = { ...merged.from, name: merged.from.name || c.name, phone: merged.from.phone || c.phone, address: merged.from.address || c.address };
  }
  return merged;
}

export const saveShipSettings = (workspaceId: string, s: ShipSettings) => setPref(workspaceId, "shipping", s);
export const newShipToken = () => randomBytes(15).toString("base64url");
