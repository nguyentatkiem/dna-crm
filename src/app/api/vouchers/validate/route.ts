import { appApi, fail, ok } from "@/lib/http";
import { validateCode } from "@/lib/voucher/service";

/** Kiểm tra mã cho form đơn hàng: ?code=&subtotal=&contactId=&orderId= → { code, discount, label }. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const r = await validateCode(a.ctx.workspace.id, sp.get("code") ?? "", Number(sp.get("subtotal")) || 0, sp.get("contactId") || null, sp.get("orderId") || null);
  if (!r.ok) return fail(r.error, 422);
  return ok({ code: r.voucher.code, discount: r.discount, label: r.label, campaign: r.campaign.name, expiresAt: r.voucher.expiresAt.toISOString() });
}
