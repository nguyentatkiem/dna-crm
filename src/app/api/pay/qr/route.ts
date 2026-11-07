// GET /api/pay/qr?orderId=…&amount=… → payload VietQR + thông tin hiển thị cho <PaymentQr/>.
import { appApi, fail, ok } from "@/lib/http";
import { visibleOrder } from "@/lib/pay/access";
import { qrDataFor } from "@/lib/pay/qrdata";
import { payToken } from "@/lib/pay/token";
import { paySettings } from "@/lib/pay/settings";
import { payPerm } from "@/lib/pay/access";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const order = await visibleOrder(a.ctx, sp.get("orderId") ?? "");
  if (!order) return fail("Không tìm thấy đơn hàng", 404);
  const amount = Number(sp.get("amount") ?? "") || undefined;
  const [data, s, perm, txns] = await Promise.all([
    qrDataFor(order, amount),
    paySettings(order.workspaceId),
    payPerm(a.ctx),
    db.bankTxn.findMany({ where: { workspaceId: order.workspaceId, orderId: order.id }, orderBy: { at: "desc" }, take: 20, select: { id: true, provider: true, externalId: true, amount: true, at: true, status: true } }),
  ]);
  const hooks = !!(s.cassoSecret || s.sepayKey);
  return ok({ ...data, publicPath: s.publicPage ? `/p/${payToken(order.id)}` : "", txns, autoReconcile: hooks, canReconcile: perm.reconcile, canSimulate: perm.reconcile && (process.env.PAY_DRY_RUN === "1" || process.env.NODE_ENV !== "production") });
}
