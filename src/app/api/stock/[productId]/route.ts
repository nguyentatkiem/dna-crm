import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

type Ctx = { params: Promise<{ productId: string }> };

/** Thẻ kho một sản phẩm: các phát sinh mới nhất trước, kèm số dư sau từng lần ghi và số đơn liên quan. */
export async function GET(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { productId } = await params;
  const wid = a.ctx.workspace.id;
  const product = await db.product.findFirst({ where: { id: productId, workspaceId: wid } });
  if (!product) return fail("Không tìm thấy sản phẩm", 404);
  const take = Math.min(1000, Math.max(10, Number(new URL(req.url).searchParams.get("take")) || 200));
  const moves = await db.stockMove.findMany({ where: { workspaceId: wid, productId }, orderBy: { createdAt: "desc" }, take });
  const orderIds = [...new Set(moves.map((m) => m.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await db.order.findMany({ where: { workspaceId: wid, id: { in: orderIds } }, select: { id: true, number: true } }) : [];
  const num = new Map(orders.map((o) => [o.id, o.number]));
  return ok({ product, moves: moves.map((m) => ({ ...m, orderNumber: m.orderId ? num.get(m.orderId) ?? "" : "" })) });
}
