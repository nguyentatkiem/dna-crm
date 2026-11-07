// Hoá đơn điện tử: GET ?orderId=… (của một đơn, kèm người mua điền sẵn) hoặc danh sách; POST phát hành.
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { docScope, scoped } from "@/lib/sales/access";
import { fold } from "@/lib/sales/shared";
import { payPerm, visibleOrder } from "@/lib/pay/access";
import { customerDetails } from "@/lib/pay/customer";
import { buyerOf, issueInvoice } from "@/lib/einvoice/service";
import { einvoiceSettings } from "@/lib/einvoice/settings";
import { EINVOICE_PROVIDERS, PROVIDER_LABEL } from "@/lib/einvoice/providers";
import type { EInvoice } from "@prisma/client";
import { parseJson } from "@/lib/db";

const out = (i: EInvoice) => ({ id: i.id, orderId: i.orderId, provider: i.provider, providerLabel: PROVIDER_LABEL[i.provider as keyof typeof PROVIDER_LABEL] ?? i.provider, status: i.status, series: i.series, number: i.number, lookupCode: i.lookupCode, pdfUrl: i.pdfUrl, total: i.total, error: i.error, issuedAt: i.issuedAt, createdAt: i.createdAt, createdBy: i.createdBy, buyer: buyerOf(i), note: parseJson<{ note?: string; cancelNote?: string }>(i.rawJson, {}).note ?? "" });

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const perm = await payPerm(a.ctx);
  const s = await einvoiceSettings(a.ctx.workspace.id);
  const provider = { key: s.provider, label: EINVOICE_PROVIDERS[s.provider].label, mode: EINVOICE_PROVIDERS[s.provider].mode, series: s.series };
  const orderId = sp.get("orderId");
  if (orderId) {
    const order = await visibleOrder(a.ctx, orderId);
    if (!order) return fail("Không tìm thấy đơn hàng", 404);
    const rows = await db.eInvoice.findMany({ where: { workspaceId: order.workspaceId, orderId: order.id }, orderBy: { createdAt: "desc" } });
    const last = rows[0];
    const c = await customerDetails(order);
    const buyer = last ? buyerOf(last) : { name: c.name, company: c.company, taxCode: c.taxCode, address: c.address, email: c.email, phone: c.phone };
    return ok({ items: rows.map(out), buyer, provider, canIssue: perm.einvoice });
  }
  const scope = await docScope(a.ctx);
  const status = sp.get("status") ?? "";
  const q = fold(sp.get("q")?.trim() ?? "");
  const visible = await db.order.findMany({ where: scoped(scope.where, {}), select: { id: true, number: true, customerName: true } });
  const om = new Map(visible.map((o) => [o.id, o]));
  const rows = await db.eInvoice.findMany({ where: { workspaceId: a.ctx.workspace.id, ...(["draft", "issued", "failed", "cancelled"].includes(status) ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
  const items = rows
    .filter((i) => om.has(i.orderId))
    .map((i) => ({ ...out(i), order: om.get(i.orderId)! }))
    .filter((i) => !q || fold(`${i.series} ${i.number} ${i.order.number} ${i.order.customerName} ${i.buyer.name} ${i.buyer.company} ${i.buyer.taxCode}`).includes(q));
  return ok({ items, provider, canIssue: perm.einvoice });
}

const Body = z.object({
  orderId: z.string().min(1),
  buyer: z.object({ name: z.string().max(200).catch(""), company: z.string().max(300).catch(""), taxCode: z.string().max(20).catch(""), address: z.string().max(400).catch(""), email: z.string().max(200).catch(""), phone: z.string().max(30).catch("") }),
});

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).einvoice) return fail("Bạn chưa có quyền xuất hoá đơn điện tử", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Thiếu thông tin người mua");
  const order = await visibleOrder(a.ctx, p.data.orderId);
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const r = await issueInvoice(order, p.data.buyer, a.ctx.user);
  if ("error" in r) return fail(r.error, r.status ?? 400);
  return ok(out(r.invoice), 201);
}
