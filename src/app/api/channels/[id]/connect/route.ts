import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { originOf } from "@/lib/sales/service";
import { patchSettings } from "@/lib/channels/accounts";
import { shopeeConnectUrl } from "@/lib/channels/shopee";
import { tiktokConnectUrl } from "@/lib/channels/tiktok";

/**
 * Link uỷ quyền shop. state = "<id tài khoản>.<mã ngẫu nhiên>" (lưu ở settings để chống giả mạo).
 * Shopee: redirect về /api/channels/oauth/shopee (kèm ?code=&shop_id=). TikTok: Redirect URL đặt trong app = /api/channels/oauth/tiktok.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return fail("Bạn không có quyền kết nối shop", 403);
  const row = await db.channelAccount.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!row || (row.platform !== "shopee" && row.platform !== "tiktok")) return fail("Không tìm thấy shop", 404);
  const nonce = randomBytes(12).toString("base64url");
  await patchSettings(row.id, { oauthState: nonce });
  const state = `${row.id}.${nonce}`;
  const origin = originOf(req.headers, new URL(req.url).origin);
  const url = row.platform === "shopee" ? shopeeConnectUrl(row, `${origin}/api/channels/oauth/shopee?state=${encodeURIComponent(state)}`) : tiktokConnectUrl(row, state);
  return ok({ url, redirect: `${origin}/api/channels/oauth/${row.platform}` });
}
