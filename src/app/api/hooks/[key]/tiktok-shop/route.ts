import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { credsOf, findAccount, isDryRunCreds, touchWebhook } from "@/lib/channels/accounts";
import { syncOneOrder } from "@/lib/channels/orders";
import { verifyTiktokWebhook } from "@/lib/channels/shop-sign";
import { logHook, readBody, workspaceByHook } from "@/lib/channels/hook";

type P = { params: Promise<{ key: string }> };

// TikTok Shop Partner Center → App → Webhooks: URL này, bật "Order status change" (type 1).
// Chữ ký: header Authorization = HMAC-SHA256(app_secret, app_key + body).

export async function GET() {
  return ok({ ok: true, provider: "TikTok Shop (đồng bộ đơn)", hint: "Đăng ký URL này ở mục Webhooks của ứng dụng TikTok Shop." });
}

export async function POST(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const { raw, body } = await readBody(req);
  if (!body) return fail("Body không phải JSON hợp lệ");
  const shopId = String(body.shop_id ?? "");
  // Một ứng dụng có thể gắn nhiều shop: tìm đúng shop, không có thì thử shop TikTok duy nhất của workspace.
  let acc = await findAccount(ws.id, "tiktok", shopId);
  if (!acc) {
    const all = await db.channelAccount.findMany({ where: { workspaceId: ws.id, platform: "tiktok" }, take: 2 });
    if (all.length === 1 && !shopId) acc = all[0];
  }
  if (!acc) {
    await logHook(ws, "tiktokshop", "ecommerce", "ignored", `Shop TikTok ${shopId || "(không rõ)"} chưa kết nối ở Hộp thư → Kênh`, raw);
    return ok({ ok: true, ignored: true });
  }
  const c = credsOf("tiktok", acc);
  if (!verifyTiktokWebhook(c.appKey, c.appSecret, raw, req.headers.get("authorization")) && !isDryRunCreds("tiktok", acc)) {
    await logHook(ws, "tiktokshop", "ecommerce", "error", "Sai chữ ký webhook TikTok Shop");
    return fail("Sai chữ ký", 401);
  }
  await touchWebhook(acc.id);
  const orderId = String(body.data?.order_id ?? "");
  if (Number(body.type) === 1 && orderId && acc.active) {
    const r = await syncOneOrder(acc, orderId).catch((e) => {
      void logHook(ws, "tiktokshop", "ecommerce", "error", `Không tải được đơn ${orderId}: ${e instanceof Error ? e.message : e}`);
      return null;
    });
    return ok({ ok: true, order: r ? { status: r.status, id: r.order.id, number: r.order.number } : null });
  }
  return ok({ ok: true, ignored: true });
}
