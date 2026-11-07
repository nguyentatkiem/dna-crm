// Đọc webhook trạng thái của hãng vận chuyển (thuần). Mỗi hãng một dạng body.
import { ghnStatus, ghtkStatus, vtpStatus } from "./carriers";
import type { ShipStatus } from "./types";

export type ShipUpdate = { trackingCode: string; status: ShipStatus; text: string; at?: Date };

const s = (v: unknown) => (v == null ? "" : String(v));

export function parseShipHook(carrier: string, body: Record<string, unknown>): ShipUpdate | null {
  if (carrier === "ghn") {
    const code = s(body.OrderCode ?? body.order_code);
    const st = s(body.Status ?? body.status);
    if (!code || !st) return null;
    return { trackingCode: code, status: ghnStatus(st), text: `GHN: ${st}${body.Description ? ` – ${s(body.Description)}` : ""}`, at: body.Time ? new Date(s(body.Time)) : undefined };
  }
  if (carrier === "ghtk") {
    const code = s(body.label_id ?? body.label);
    const st = body.status_id;
    if (!code || st == null) return null;
    return { trackingCode: code, status: ghtkStatus(st as number), text: `GHTK: trạng thái ${s(st)}${body.reason ? ` – ${s(body.reason)}` : ""}` };
  }
  if (carrier === "vtp") {
    const d = (body.DATA ?? body.data ?? body) as Record<string, unknown>;
    const code = s(d.ORDER_NUMBER);
    if (!code || d.ORDER_STATUS == null) return null;
    return { trackingCode: code, status: vtpStatus(d.ORDER_STATUS as number), text: `Viettel Post: ${s(d.STATUS_NAME) || s(d.ORDER_STATUS)}${d.NOTE ? ` – ${s(d.NOTE)}` : ""}` };
  }
  if (carrier === "demo") {
    const code = s(body.trackingCode);
    const st = s(body.status) as ShipStatus;
    if (!code || !["created", "picking", "delivering", "delivered", "returned", "cancelled", "failed"].includes(st)) return null;
    return { trackingCode: code, status: st, text: s(body.text) || `Demo: ${st}` };
  }
  return null;
}

/** Token xác thực: ?token=… trên URL, header X-Webhook-Token, hoặc TOKEN trong body (Viettel Post). */
export function hookToken(url: URL, h: Headers, body: Record<string, unknown>) {
  return url.searchParams.get("token") || h.get("x-webhook-token") || s(body.TOKEN) || "";
}
