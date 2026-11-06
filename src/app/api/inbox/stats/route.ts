import { appApi, fail, ok } from "@/lib/http";
import { XLSX_MIME } from "@/lib/xlsx";
import { inboxStats, statsXlsx } from "@/lib/chat/stats";

/**
 * Thống kê hộp thư: ?range=today|7d|30d|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&channel=&kind=inbox|comment&format=xlsx
 * Có quyền "Thống kê hộp thư" → toàn bộ (theo phạm vi dữ liệu); không có → chỉ số liệu của chính mình.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const u = new URL(req.url).searchParams;
  try {
    const s = await inboxStats(a.ctx, { range: u.get("range") ?? "7d", from: u.get("from"), to: u.get("to"), page: u.get("page") ?? "", channel: u.get("channel") ?? "", kind: u.get("kind") ?? "" });
    if (u.get("format") === "xlsx") {
      const buf = await statsXlsx(s);
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="thong-ke-hop-thu-${s.fromDay}_${s.toDay}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return ok(s);
  } catch (e) {
    console.error("[inbox stats]", e);
    return fail("Không tính được thống kê", 500);
  }
}
