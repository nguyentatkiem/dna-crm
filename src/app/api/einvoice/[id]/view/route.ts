// Bản thể hiện HTML (in / lưu PDF) của một hoá đơn. Cần đăng nhập và thấy được đơn.
import { db } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { visibleOrder } from "@/lib/pay/access";
import { docOf } from "@/lib/einvoice/service";
import { invoiceHtml } from "@/lib/einvoice/html";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const inv = await db.eInvoice.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!inv || !(await visibleOrder(a.ctx, inv.orderId))) return fail("Không tìm thấy hoá đơn", 404);
  const doc = docOf(inv);
  if (!doc) return fail("Hoá đơn chưa có nội dung", 404);
  return new Response(invoiceHtml(doc, { status: inv.status }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
