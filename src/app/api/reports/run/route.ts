import { appApi, fail, ok } from "@/lib/http";
import { runReport } from "@/lib/reports/engine";
import { canManageReports, findVisibleReport, parseConfig } from "@/lib/reports/service";
import { validateConfig } from "@/lib/reports/shared";

/**
 * Chạy báo cáo theo phạm vi quyền của người xem.
 * { id } → báo cáo đã lưu mà người xem thấy được; { config } → xem trước cấu hình (cần quyền "Báo cáo tự tạo").
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; config?: unknown };
  let config;
  if (typeof body.id === "string") {
    const r = await findVisibleReport(a.ctx, body.id);
    if (!r) return fail("Không tìm thấy báo cáo", 404);
    config = parseConfig(r, a.ctx.config);
    if (!config) return fail("Cấu hình báo cáo không còn hợp lệ (bảng hoặc trường đã đổi)");
  } else {
    if (!(await canManageReports(a.ctx))) return fail("Bạn chưa có quyền tạo báo cáo", 403);
    const v = validateConfig(body.config, a.ctx.config);
    if (!v.ok) return fail(v.error);
    config = v.config;
  }
  return ok({ config, result: await runReport(a.ctx, a.ctx.config, config) });
}
