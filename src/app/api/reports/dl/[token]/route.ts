// Link tải công khai trong email báo cáo (ký bằng jose, hết hạn 7 ngày). Không cần đăng nhập:
// số liệu tính lại lúc tải theo phạm vi quyền của người tạo báo cáo; báo cáo bị xoá → link hết hiệu lực.
import { db } from "@/lib/db";
import { activeConfig, ctxForUser, runReport } from "@/lib/reports/engine";
import { downloadHeaders, reportXlsx } from "@/lib/reports/export";
import { parseConfig } from "@/lib/reports/service";
import { verifyDownload } from "@/lib/reports/token";
import { XLSX_MIME } from "@/lib/xlsx";

const text = (s: string, status: number) => new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const claims = await verifyDownload((await params).token);
  if (!claims) return text("Link tải đã hết hạn hoặc không hợp lệ. Hãy mở báo cáo trong CRM để tải lại.", 410);
  const r = await db.report.findFirst({ where: { id: claims.rid, workspaceId: claims.wid, createdBy: claims.uid } });
  if (!r) return text("Báo cáo không còn tồn tại.", 404);
  const ctx = await ctxForUser(r.workspaceId, r.createdBy);
  if (!ctx) return text("Người tạo báo cáo không còn trong workspace.", 410);
  const cfg = await activeConfig(r.workspaceId);
  const config = parseConfig(r, cfg);
  if (!config) return text("Cấu hình báo cáo không còn hợp lệ.", 422);
  const result = await runReport(ctx, cfg, config);
  return new Response(new Uint8Array(await reportXlsx(r.name, result)), { headers: downloadHeaders(r.name, "xlsx", XLSX_MIME) });
}
