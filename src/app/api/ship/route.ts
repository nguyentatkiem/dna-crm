// Vận đơn của một đơn: GET ?orderId=… (vận đơn + địa chỉ + hãng đã cấu hình), POST báo phí / tạo, PUT lưu địa chỉ giao.
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { payPerm, visibleOrder } from "@/lib/pay/access";
import { customerDetails } from "@/lib/pay/customer";
import { remaining } from "@/lib/sales/shared";
import { CARRIER_IMPL } from "@/lib/ship/carriers";
import { buildShipInput, cfgFor, createShipment, quoteShipment, shipOut } from "@/lib/ship/service";
import { shipSettings } from "@/lib/ship/settings";
import { CARRIERS, CARRIER_LABEL, type CarrierKey } from "@/lib/ship/types";


export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const order = await visibleOrder(a.ctx, new URL(req.url).searchParams.get("orderId") ?? "");
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const [rows, s, perm] = await Promise.all([db.shipment.findMany({ where: { workspaceId: order.workspaceId, orderId: order.id }, orderBy: { createdAt: "desc" } }), shipSettings(order.workspaceId), payPerm(a.ctx)]);
  let address = { name: order.shipName, phone: order.shipPhone, address: order.shipAddress, province: order.shipProvince, district: order.shipDistrict, ward: order.shipWard };
  if (!address.address) {
    const c = await customerDetails(order);
    address = { ...address, name: address.name || c.name, phone: address.phone || c.phone, address: c.address };
  }
  const input = await buildShipInput(order, s);
  const carriers = CARRIERS.map((k) => ({ key: k, label: CARRIER_LABEL[k], configured: CARRIER_IMPL[k].configured(cfgFor(s, k)) }));
  return ok({ items: rows.map(shipOut), address, weightGram: input.weightGram, cod: remaining(order), defaultCarrier: s.defaultCarrier, carriers, canManage: perm.ship, fromReady: !!(s.from.name && s.from.address), dryRun: process.env.PAY_DRY_RUN === "1" });
}

const Opt = { weightGram: z.coerce.number().min(1).max(100000).optional(), cod: z.coerce.number().min(0).max(1e11).optional(), note: z.string().max(500).optional() };
const Body = z.object({ action: z.enum(["quote", "create"]), orderId: z.string().min(1), carrier: z.enum(CARRIERS as [CarrierKey, ...CarrierKey[]]), ...Opt });

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).ship) return fail("Bạn chưa có quyền tạo vận đơn", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const order = await visibleOrder(a.ctx, p.data.orderId);
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const { action, carrier, ...over } = p.data;
  if (action === "quote") {
    const r = await quoteShipment(order, carrier, over);
    return "error" in r ? fail(r.error ?? "Không báo được phí", 502) : ok(r);
  }
  const r = await createShipment(order, carrier, over, a.ctx.user);
  return "error" in r ? fail(r.error, r.status ?? 502) : ok(shipOut(r.shipment), 201);
}

const Addr = z.object({ orderId: z.string().min(1), name: z.string().trim().max(120), phone: z.string().trim().max(20), address: z.string().trim().max(300), province: z.string().trim().max(80), district: z.string().trim().max(80), ward: z.string().trim().max(80) });

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const perm = await payPerm(a.ctx);
  if (!perm.ship) return fail("Bạn chưa có quyền sửa địa chỉ giao", 403);
  const p = Addr.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const order = await visibleOrder(a.ctx, p.data.orderId);
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const d = p.data;
  await db.order.update({ where: { id: order.id }, data: { shipName: d.name, shipPhone: d.phone, shipAddress: d.address, shipProvince: d.province, shipDistrict: d.district, shipWard: d.ward } });
  return ok({ ok: true });
}
