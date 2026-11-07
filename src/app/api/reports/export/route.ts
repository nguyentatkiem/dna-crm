import { appApi, fail } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { runReport } from "@/lib/reports/engine";
import { downloadHeaders, reportCsv, reportXlsx } from "@/lib/reports/export";
import { findVisibleReport, parseConfig } from "@/lib/reports/service";
import { validateConfig } from "@/lib/reports/shared";
import { XLSX_MIME } from "@/lib/xlsx";

/**
 * Xuất Excel/CSV theo phạm vi quyền của người xem. GET ?id=&format=xlsx|csv (báo cáo đã lưu);
 * POST { name, config, format } (bản đang dựng, cần quyền "Báo cáo tự tạo").
 */
async function exportReport(name: string, config: Parameters<typeof runReport>[2], format: string, ctx: Parameters<typeof runReport>[0], cfg: Parameters<typeof runReport>[1]) {
  const result = await runReport(ctx, cfg, config);
  if (format === "csv") return new Response(reportCsv(result), { headers: downloadHeaders(name, "csv", "text/csv; charset=utf-8") });
  return new Response(new Uint8Array(await reportXlsx(name, result)), { headers: downloadHeaders(name, "xlsx", XLSX_MIME) });
}

const canExport = async (ctx: Parameters<typeof accessOf>[0]) => {
  const acc = await accessOf(ctx);
  return allow(acc, "reports_manage") || allow(acc, "record_export");
};

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canExport(a.ctx))) return fail("Bạn chưa có quyền xuất dữ liệu", 403);
  const sp = new URL(req.url).searchParams;
  const r = await findVisibleReport(a.ctx, sp.get("id") ?? "");
  if (!r) return fail("Không tìm thấy báo cáo", 404);
  const config = parseConfig(r, a.ctx.config);
  if (!config) return fail("Cấu hình báo cáo không còn hợp lệ");
  return exportReport(r.name, config, sp.get("format") ?? "xlsx", a.ctx, a.ctx.config);
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "reports_manage")) return fail("Bạn chưa có quyền tạo báo cáo", 403);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; config?: unknown; format?: unknown };
  const v = validateConfig(body.config, a.ctx.config);
  if (!v.ok) return fail(v.error);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Báo cáo";
  return exportReport(name, v.config, body.format === "csv" ? "csv" : "xlsx", a.ctx, a.ctx.config);
}
