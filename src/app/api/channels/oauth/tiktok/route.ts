import { NextResponse } from "next/server";
import { appApi } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { accountFromState, finishOAuth } from "@/lib/channels/oauth";
import { tiktokExchangeCode } from "@/lib/channels/tiktok";

/** Redirect URL của ứng dụng TikTok Shop: ?code=&state= → đổi token, lấy shop_cipher, đồng bộ đơn. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/w/inbox/pages?tab=tiktok&${q}`, url));
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return back("error=" + encodeURIComponent("Bạn không có quyền kết nối shop"));
  const code = url.searchParams.get("code") ?? "";
  const row = await accountFromState(a.ctx.workspace.id, "tiktok", url.searchParams.get("state") ?? "");
  if (!row || !code) return back("error=" + encodeURIComponent("Liên kết uỷ quyền không hợp lệ hoặc đã hết hạn. Bấm “Kết nối qua TikTok Shop” lại."));
  try {
    const { sellerName, shopId, ...patch } = await tiktokExchangeCode(row, code);
    await finishOAuth(row, { ...patch, shopId }, shopId, a.ctx.user, sellerName ? `${sellerName} · TikTok Shop` : undefined);
    return back("connected=1");
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
}
