// Tìm đơn còn nợ để ghép tay giao dịch: GET /api/pay/orders?q=…
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { payPerm } from "@/lib/pay/access";
import { fold, remaining } from "@/lib/sales/shared";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).reconcile) return fail("Bạn chưa có quyền đối soát chuyển khoản", 403);
  const q = fold(new URL(req.url).searchParams.get("q")?.trim() ?? "");
  const rows = await db.order.findMany({ where: { workspaceId: a.ctx.workspace.id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, number: true, customerName: true, customerPhone: true, total: true, paid: true, status: true, payCode: true } });
  const items = rows.filter((o) => remaining(o) > 0 && (!q || fold(`${o.number} ${o.payCode} ${o.customerName} ${o.customerPhone}`).includes(q))).slice(0, 30);
  return ok({ items: items.map((o) => ({ ...o, remaining: remaining(o) })) });
}
