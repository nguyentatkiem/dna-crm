// Xuất gộp các hoá đơn nháp (chờ phát hành) của một nhà cung cấp: GET /api/einvoice/export?provider=misa
import { db } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { payPerm } from "@/lib/pay/access";
import { exportResponse } from "@/lib/einvoice/export";
import { isProviderKey } from "@/lib/einvoice/providers";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await payPerm(a.ctx)).einvoice) return fail("Bạn chưa có quyền với hoá đơn điện tử", 403);
  const provider = new URL(req.url).searchParams.get("provider") ?? "";
  if (!isProviderKey(provider) || provider === "demo") return fail("Chọn nhà cung cấp MISA / Viettel / VNPT");
  const invs = await db.eInvoice.findMany({ where: { workspaceId: a.ctx.workspace.id, provider, status: "draft" }, orderBy: { createdAt: "asc" }, take: 500 });
  if (!invs.length) return fail("Không có hoá đơn nháp nào chờ xuất file", 404);
  return exportResponse(invs);
}
