// File Excel bảng kê để nhập một hoá đơn vào MISA / Viettel / VNPT.
import { db } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { payPerm, visibleOrder } from "@/lib/pay/access";
import { exportResponse } from "@/lib/einvoice/export";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).einvoice) return fail("Bạn chưa có quyền với hoá đơn điện tử", 403);
  const inv = await db.eInvoice.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!inv || !(await visibleOrder(a.ctx, inv.orderId))) return fail("Không tìm thấy hoá đơn", 404);
  return exportResponse([inv]);
}
