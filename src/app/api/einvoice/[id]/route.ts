// PATCH /api/einvoice/:id  { action: "cancel", reason } | { action: "number", series, number, lookupCode, issuedAt }
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { payPerm, visibleOrder } from "@/lib/pay/access";
import { cancelInvoice, recordNumber } from "@/lib/einvoice/service";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().max(300).catch("") }),
  z.object({ action: z.literal("number"), series: z.string().max(12), number: z.string().max(12), lookupCode: z.string().max(60).catch(""), issuedAt: z.string().optional() }),
]);

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).einvoice) return fail("Bạn chưa có quyền với hoá đơn điện tử", 403);
  const inv = await db.eInvoice.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!inv || !(await visibleOrder(a.ctx, inv.orderId))) return fail("Không tìm thấy hoá đơn", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const d = p.data;
  const r = d.action === "cancel" ? await cancelInvoice(inv, d.reason, a.ctx.user) : await recordNumber(inv, { series: d.series, number: d.number, lookupCode: d.lookupCode, issuedAt: d.issuedAt ? new Date(d.issuedAt) : undefined }, a.ctx.user);
  if ("error" in r) return fail(r.error ?? "Không thực hiện được", 409);
  return ok({ ok: true, id: r.invoice.id, status: r.invoice.status });
}
