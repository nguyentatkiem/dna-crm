import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { docScope, linkedTo, scoped, resolveLinks } from "@/lib/sales/access";
import { totals } from "@/lib/sales/lines";
import { OrderInput, firstError } from "@/lib/sales/schemas";
import { orderFromQuote } from "@/lib/sales/service";
import { ORDER_STATUSES, fold, overdue, remaining } from "@/lib/sales/shared";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const s = await docScope(a.ctx);
  const status = sp.get("status") ?? "";
  const debt = sp.get("debt") ?? "";
  const record = sp.get("record") ?? "";
  const q = fold(sp.get("q")?.trim() ?? "");
  const extra = { ...(record ? linkedTo(record) : {}), ...(ORDER_STATUSES.includes(status as never) ? { status } : {}) };
  const rows = await db.order.findMany({ where: scoped(s.where, extra), orderBy: { createdAt: "desc" }, take: 1000 });
  const items = rows.filter(
    (o) => (!q || fold(`${o.number} ${o.customerName} ${o.customerPhone}`).includes(q)) && (debt === "open" ? remaining(o) > 0 : debt === "overdue" ? overdue(o) : true),
  );
  const live = items.filter((o) => o.status !== "cancelled");
  const sum = { revenue: live.reduce((x, o) => x + o.total, 0), paid: live.reduce((x, o) => x + o.paid, 0), debt: live.reduce((x, o) => x + remaining(o), 0) };
  return ok({ items, sum });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = await docScope(a.ctx);
  const wid = a.ctx.workspace.id;

  if (typeof body.quoteId === "string") {
    const q = await db.quote.findFirst({ where: scoped(s.where, { id: body.quoteId }) });
    if (!q) return fail("Không tìm thấy báo giá", 404);
    if (!["approved", "sent", "accepted"].includes(q.status)) return fail("Báo giá cần được duyệt trước khi tạo đơn", 409);
    return ok(await orderFromQuote(q, a.ctx.user), 201);
  }

  const p = OrderInput.safeParse(body);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const number = await nextNumber(wid, "DH");
  const order = await db.order.create({
    data: {
      workspaceId: wid,
      number,
      ...(await resolveLinks(a.ctx, d)),
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      itemsJson: JSON.stringify(d.items),
      ...totals(d.items, d.discount),
      dueAt: d.dueAt ?? null,
      note: d.note,
      createdBy: a.ctx.user.name,
    },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "order.create", "order", order.id, `Tạo đơn ${number} cho ${order.customerName} (${order.total.toLocaleString("vi-VN")} ₫)`);
  return ok(order, 201);
}
