import { NextResponse } from "next/server";
import { appApi } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { accountFromState, finishOAuth } from "@/lib/channels/oauth";
import { shopeeExchangeCode } from "@/lib/channels/shopee";

/** Shopee chuyển về đây sau khi chủ shop uỷ quyền: ?code=&shop_id=&state= → đổi token, đồng bộ đơn. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/w/inbox/pages?tab=shopee&${q}`, url));
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "integrations_manage")) return back("error=" + encodeURIComponent("Bạn không có quyền kết nối shop"));
  const code = url.searchParams.get("code") ?? "";
  const shopId = url.searchParams.get("shop_id") ?? "";
  const row = await accountFromState(a.ctx.workspace.id, "shopee", url.searchParams.get("state") ?? "");
  if (!row || !code || !shopId) return back("error=" + encodeURIComponent("Liên kết uỷ quyền không hợp lệ hoặc đã hết hạn. Bấm “Kết nối qua Shopee” lại."));
  try {
    const patch = await shopeeExchangeCode(row, code, shopId);
    await finishOAuth(row, patch, shopId, a.ctx.user);
    return back("connected=1");
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
}
