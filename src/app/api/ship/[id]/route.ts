// PATCH /api/ship/:id { action: "cancel" | "refresh" | "label" }
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { payPerm, visibleOrder } from "@/lib/pay/access";
import { CARRIER_IMPL } from "@/lib/ship/carriers";
import { cancelShipment, cfgFor, refreshShipment, shipOut } from "@/lib/ship/service";
import { shipSettings } from "@/lib/ship/settings";
import type { CarrierKey } from "@/lib/ship/types";

const Body = z.object({ action: z.enum(["cancel", "refresh", "label"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sh = await db.shipment.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!sh || !(await visibleOrder(a.ctx, sh.orderId))) return fail("Không tìm thấy vận đơn", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  if (p.data.action === "refresh") {
    try {
      return ok(shipOut(await refreshShipment(sh)));
    } catch (e) {
      return fail(`Không tra cứu được: ${e instanceof Error ? e.message : e}`, 502);
    }
  }
  if (!(await payPerm(a.ctx)).ship) return fail("Bạn chưa có quyền với vận đơn", 403);
  if (p.data.action === "label") {
    const k = sh.carrier as CarrierKey;
    const url = await CARRIER_IMPL[k]?.labelUrl?.(sh.trackingCode, cfgFor(await shipSettings(sh.workspaceId), k));
    return url ? ok({ url }) : fail("Hãng này chưa hỗ trợ in nhãn từ CRM. Hãy in trên trang quản lý của hãng.", 404);
  }
  const r = await cancelShipment(sh, a.ctx.user);
  return "error" in r ? fail(r.error ?? "Không huỷ được", 409) : ok(shipOut(r.shipment));
}
