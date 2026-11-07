// Nghiệp vụ vận đơn: dựng đầu vào từ đơn hàng, báo phí, tạo, huỷ, cập nhật trạng thái (webhook / tra cứu / demo).
import type { Order, Shipment } from "@prisma/client";
import { db, parseJson } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify, userIdByName } from "@/lib/notify";
import { parseLines } from "@/lib/sales/lines";
import { afterOrderStatus } from "@/lib/sales/service";
import { money, remaining } from "@/lib/sales/shared";
import { CARRIER_IMPL, DEMO_FLOW } from "./carriers";
import { shipSettings, type ShipSettings } from "./settings";
import { ACTIVE_SHIP, CARRIER_LABEL, SHIP_STATUS, type Address, type CarrierKey, type ShipEvent, type ShipInput, type ShipItem, type ShipStatus } from "./types";

type Actor = { id: string; name: string } | null;

export const eventsOf = (s: Pick<Shipment, "eventsJson">) => parseJson<ShipEvent[]>(s.eventsJson, []);
/** Vận đơn gửi ra trình duyệt. */
export const shipOut = (s: Shipment) => ({ id: s.id, carrier: s.carrier, carrierLabel: CARRIER_LABEL[s.carrier as CarrierKey] ?? s.carrier, trackingCode: s.trackingCode, status: s.status, fee: s.fee, cod: s.cod, events: eventsOf(s), error: s.error, createdAt: s.createdAt, createdBy: s.createdBy, labelUrl: parseJson<{ labelUrl?: string }>(s.rawJson, {}).labelUrl ?? "" });
export const cfgFor = (s: ShipSettings, k: CarrierKey) => (k === "demo" ? {} : s[k]) as never;

/** Địa chỉ nhận của đơn (đã lưu ở Order.ship*). */
export const orderAddress = (o: Order): Address => ({ name: o.shipName || o.customerName, phone: o.shipPhone || o.customerPhone, address: o.shipAddress, province: o.shipProvince, district: o.shipDistrict, ward: o.shipWard });

/** Dòng hàng kèm khối lượng sản phẩm (Product.weightGram, thiếu thì dùng mặc định). */
export async function itemsWithWeight(o: Order, defaultWeight: number): Promise<ShipItem[]> {
  const lines = parseLines(o.itemsJson);
  const ids = lines.map((l) => l.productId).filter((x): x is string => !!x);
  const prods = ids.length ? await db.product.findMany({ where: { workspaceId: o.workspaceId, id: { in: ids } }, select: { id: true, weightGram: true } }) : [];
  const w = new Map(prods.map((p) => [p.id, p.weightGram]));
  return lines.map((l) => ({ name: l.name, code: l.code, qty: Number(l.qty) || 1, weightGram: (l.productId && w.get(l.productId)) || defaultWeight, price: Number(l.price) || 0 }));
}

export async function buildShipInput(o: Order, s: ShipSettings, over: { weightGram?: number; cod?: number; note?: string } = {}): Promise<ShipInput> {
  const items = await itemsWithWeight(o, s.defaultWeight);
  const weight = items.reduce((t, x) => t + x.weightGram * Math.max(1, x.qty), 0);
  return {
    orderNumber: o.number,
    from: s.from,
    to: orderAddress(o),
    items,
    weightGram: Math.max(1, Math.round(over.weightGram ?? weight)),
    cod: Math.max(0, Math.round(over.cod ?? remaining(o))),
    value: Math.round(o.total),
    note: over.note ?? "",
  };
}

export function validateInput(i: ShipInput): string | null {
  if (!i.to.name.trim()) return "Thiếu tên người nhận";
  if (!/^0\d{8,10}$/.test(i.to.phone.replace(/[\s.]/g, "")) && !/^\+?84\d{8,10}$/.test(i.to.phone.replace(/[\s.]/g, ""))) return "Số điện thoại người nhận chưa đúng";
  if (!i.to.address.trim() || !i.to.province.trim() || !i.to.district.trim()) return "Cần địa chỉ, quận/huyện, tỉnh/thành người nhận";
  if (!i.from.name.trim() || !i.from.address.trim()) return "Chưa có địa chỉ lấy hàng: điền ở Cài đặt → Thanh toán & giao hàng";
  return null;
}

export async function quoteShipment(o: Order, carrier: CarrierKey, over: { weightGram?: number; cod?: number } = {}) {
  const s = await shipSettings(o.workspaceId);
  const impl = CARRIER_IMPL[carrier];
  if (!impl.configured(cfgFor(s, carrier))) return { error: `${CARRIER_LABEL[carrier]} chưa được cấu hình` };
  const input = await buildShipInput(o, s, over);
  try {
    return { ...(await impl.quote(input, cfgFor(s, carrier))), weightGram: input.weightGram, cod: input.cod };
  } catch (e) {
    return { error: `${CARRIER_LABEL[carrier]}: ${e instanceof Error ? e.message : e}` };
  }
}

export async function createShipment(o: Order, carrier: CarrierKey, over: { weightGram?: number; cod?: number; note?: string }, actor: Actor): Promise<{ shipment: Shipment } | { error: string; status?: number }> {
  if (o.status === "cancelled" || o.status === "done") return { error: o.status === "done" ? "Đơn đã hoàn tất" : "Đơn đã huỷ", status: 409 };
  const active = await db.shipment.findFirst({ where: { workspaceId: o.workspaceId, orderId: o.id, status: { in: ACTIVE_SHIP } } });
  if (active) return { error: `Đơn đang có vận đơn ${active.trackingCode} (${CARRIER_LABEL[active.carrier as CarrierKey] ?? active.carrier}). Huỷ vận đơn cũ trước.`, status: 409 };
  const s = await shipSettings(o.workspaceId);
  const impl = CARRIER_IMPL[carrier];
  if (!impl.configured(cfgFor(s, carrier))) return { error: `${CARRIER_LABEL[carrier]} chưa được cấu hình ở Cài đặt → Thanh toán & giao hàng` };
  const input = await buildShipInput(o, s, over);
  const bad = validateInput(input);
  if (bad) return { error: bad };
  try {
    const r = await impl.create(input, cfgFor(s, carrier));
    const ev: ShipEvent = { at: new Date().toISOString(), status: "created", text: r.dryRun ? `Chạy khô (PAY_DRY_RUN) – chưa gửi tới ${CARRIER_LABEL[carrier]}` : carrier === "demo" ? "Tạo vận đơn mô phỏng" : `Đã tạo vận đơn trên ${CARRIER_LABEL[carrier]}` };
    const shipment = await db.shipment.create({
      data: { workspaceId: o.workspaceId, orderId: o.id, carrier, trackingCode: r.trackingCode, status: "created", fee: Math.round(r.fee), cod: input.cod, eventsJson: JSON.stringify([ev]), rawJson: JSON.stringify({ create: r.raw, labelUrl: r.labelUrl ?? "", input: { weightGram: input.weightGram, to: input.to } }).slice(0, 20000), createdBy: actor?.name ?? "" },
    });
    if (s.autoShipping && (o.status === "new" || o.status === "confirmed")) {
      await db.order.update({ where: { id: o.id }, data: { status: "shipping" } });
      await audit({ workspaceId: o.workspaceId, user: actor }, "order.update", "order", o.id, `Đơn ${o.number}: trạng thái → Đang giao (tạo vận đơn)`);
      await afterOrderStatus(o.workspaceId, o.id, actor);
    }
    await audit({ workspaceId: o.workspaceId, user: actor }, "shipment.create", "order", o.id, `Tạo vận đơn ${CARRIER_LABEL[carrier]} ${r.trackingCode} cho đơn ${o.number} · COD ${money(input.cod)}`);
    return { shipment };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `${CARRIER_LABEL[carrier]}: ${msg}` };
  }
}

export async function cancelShipment(sh: Shipment, actor: Actor) {
  if (!ACTIVE_SHIP.includes(sh.status as ShipStatus)) return { error: "Vận đơn không còn huỷ được" };
  const s = await shipSettings(sh.workspaceId);
  const k = sh.carrier as CarrierKey;
  const impl = CARRIER_IMPL[k];
  if (impl) {
    try {
      const r = await impl.cancel(sh.trackingCode, cfgFor(s, k));
      if (!r.ok) return { error: `${CARRIER_LABEL[k]}: ${r.note || "không huỷ được"}` };
    } catch (e) {
      return { error: `${CARRIER_LABEL[k]}: ${e instanceof Error ? e.message : e}` };
    }
  }
  const updated = await applyStatus(sh, "cancelled", `Huỷ bởi ${actor?.name ?? "hệ thống"}`);
  await audit({ workspaceId: sh.workspaceId, user: actor }, "shipment.cancel", "order", sh.orderId, `Huỷ vận đơn ${sh.trackingCode}`);
  return { shipment: updated };
}

const RANK: Record<ShipStatus, number> = { created: 0, picking: 1, delivering: 2, failed: 2, delivered: 3, returned: 3, cancelled: 4 };

/** Ghi trạng thái mới + sự kiện. Đã giao → (tuỳ cài đặt) chuyển đơn Hoàn tất; báo người lập đơn. Bỏ qua cập nhật lùi trạng thái cuối. */
export async function applyStatus(sh: Shipment, status: ShipStatus, text: string, at = new Date()) {
  const cur = sh.status as ShipStatus;
  const final = cur === "delivered" || cur === "returned" || cur === "cancelled";
  const events = eventsOf(sh);
  const last = events[events.length - 1];
  if (last && last.status === status && last.text === text) return sh;
  events.push({ at: at.toISOString(), status, text: text.slice(0, 200) });
  const nextStatus = final && RANK[status] < RANK[cur] ? cur : status;
  const updated = await db.shipment.update({ where: { id: sh.id }, data: { status: nextStatus, eventsJson: JSON.stringify(events.slice(-50)) } });
  if (nextStatus !== cur) {
    const o = await db.order.findUnique({ where: { id: sh.orderId } });
    if (o) {
      if (nextStatus === "delivered") {
        const s = await shipSettings(sh.workspaceId);
        if (s.autoDone && (o.status === "shipping" || o.status === "confirmed" || o.status === "new")) {
          await db.order.update({ where: { id: o.id }, data: { status: "done" } });
          await audit({ workspaceId: o.workspaceId, user: null }, "order.update", "order", o.id, `Đơn ${o.number}: trạng thái → Hoàn tất (hãng báo đã giao ${sh.trackingCode})`);
          await afterOrderStatus(o.workspaceId, o.id, null);
        }
      }
      if (nextStatus === "delivered" || nextStatus === "returned" || nextStatus === "failed") {
        const uid = await userIdByName(o.workspaceId, o.createdBy);
        if (uid) await notify(o.workspaceId, { userId: uid, kind: "shipment", text: `🚚 Vận đơn ${sh.trackingCode} của đơn ${o.number}: ${SHIP_STATUS[nextStatus].label}`, href: `/w/orders/${o.id}` });
      }
    }
  }
  return updated;
}

/** Tra cứu trạng thái từ hãng (nút "Cập nhật"). */
export async function refreshShipment(sh: Shipment) {
  const s = await shipSettings(sh.workspaceId);
  const k = sh.carrier as CarrierKey;
  const impl = CARRIER_IMPL[k];
  if (!impl || k === "demo") return sh;
  const r = await impl.track(sh.trackingCode, cfgFor(s, k));
  if (!r) return sh;
  const lastText = r.events[r.events.length - 1]?.text ?? SHIP_STATUS[r.status].label;
  return applyStatus(sh, r.status, lastText);
}

/** Job: đẩy vận đơn demo đi một bước mỗi `stepMinutes` phút (Đã tạo → Đang lấy → Đang giao → Đã giao). */
export async function tickDemoShipments(now = new Date(), stepMinutes = 2): Promise<number> {
  const rows = await db.shipment.findMany({ where: { carrier: "demo", status: { in: ["created", "picking", "delivering"] } }, take: 200 });
  let n = 0;
  const TEXT: Partial<Record<ShipStatus, string>> = { picking: "Shipper demo đang lấy hàng", delivering: "Đang giao tới người nhận (demo)", delivered: "Giao thành công (demo)" };
  for (const sh of rows) {
    const last = eventsOf(sh).at(-1);
    const since = now.getTime() - new Date(last?.at ?? sh.updatedAt).getTime();
    if (since < stepMinutes * 60_000) continue;
    const next = DEMO_FLOW[DEMO_FLOW.indexOf(sh.status as ShipStatus) + 1];
    if (!next) continue;
    await applyStatus(sh, next, TEXT[next] ?? SHIP_STATUS[next].label, now);
    n++;
  }
  return n;
}
