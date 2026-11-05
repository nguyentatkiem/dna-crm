import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { syncWorkspaceAds } from "@/lib/marketing/ads";

/** Nút "Đồng bộ ngay": kéo chi phí 30 ngày từ Facebook / Google Ads, trả lỗi rõ ràng từng nền tảng. */
export async function POST() {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const results = await syncWorkspaceAds(a.ctx.workspace.id);
  if (!results.length) return fail("Chưa kết nối tài khoản quảng cáo nào. Bấm “Kết nối tài khoản quảng cáo” để nhập khoá.");
  return ok({ results });
}
