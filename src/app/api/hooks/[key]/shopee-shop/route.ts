import { fail, ok } from "@/lib/http";
import { credsOf, findAccount, isDryRunCreds, touchWebhook } from "@/lib/channels/accounts";
import { syncOneOrder } from "@/lib/channels/orders";
import { verifyShopeePush } from "@/lib/channels/shop-sign";
import { logHook, publicUrls, readBody, workspaceByHook } from "@/lib/channels/hook";

type P = { params: Promise<{ key: string }> };

// Shopee Open Platform → App → Push Mechanism: URL này, bật "Order Status Push" (code 3) và "Order TrackingNo Push" (code 4).
// Chữ ký: header Authorization = HMAC-SHA256(partner_key, URL + "|" + body).

export async function GET() {
  return ok({ ok: true, provider: "Shopee (đồng bộ đơn)", hint: "Đăng ký URL này ở Push Mechanism của ứng dụng Shopee." });
}

export async function POST(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const { raw, body } = await readBody(req);
  if (!body) return fail("Body không phải JSON hợp lệ");
  const shopId = String(body.shop_id ?? "");
  const acc = await findAccount(ws.id, "shopee", shopId);
  if (!acc) {
    await logHook(ws, "shopee", "ecommerce", "ignored", `Shop Shopee ${shopId || "(không rõ)"} chưa kết nối ở Hộp thư → Kênh`, raw);
    return ok({ ok: true, ignored: true });
  }
  const key = credsOf("shopee", acc).partnerKey;
  // Tài khoản chạy thử (khoá demo_) cho phép push không ký để thử bằng curl.
  const signed = publicUrls(req).some((u) => verifyShopeePush(key, u, raw, req.headers.get("authorization")));
  if (!signed && !isDryRunCreds("shopee", acc)) {
    await logHook(ws, "shopee", "ecommerce", "error", "Sai chữ ký push Shopee");
    return fail("Sai chữ ký", 401);
  }
  await touchWebhook(acc.id);
  const code = Number(body.code);
  const sn = String(body.data?.ordersn ?? body.data?.order_sn ?? "");
  if ((code === 3 || code === 4) && sn && acc.active) {
    const r = await syncOneOrder(acc, sn).catch((e) => {
      void logHook(ws, "shopee", "ecommerce", "error", `Không tải được đơn ${sn}: ${e instanceof Error ? e.message : e}`);
      return null;
    });
    return ok({ ok: true, order: r ? { status: r.status, id: r.order.id, number: r.order.number } : null });
  }
  return ok({ ok: true, ignored: true });
}
