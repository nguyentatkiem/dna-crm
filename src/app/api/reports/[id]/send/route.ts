import { appApi, fail, ok } from "@/lib/http";
import { publicOrigin } from "@/lib/care/tickets";
import { canEditReport, deliverReport, findVisibleReport } from "@/lib/reports/service";

/** "Gửi thử ngay": gửi email báo cáo tới danh sách người nhận (mặc định email người tạo). Không đổi lastSentAt. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await findVisibleReport(a.ctx, (await params).id);
  if (!r) return fail("Không tìm thấy báo cáo", 404);
  if (!(await canEditReport(a.ctx, r))) return fail("Chỉ người tạo báo cáo gửi thử được", 403);
  const res = await deliverReport(r, { origin: publicOrigin(req) });
  if (!res.ok) return fail(res.error, 422);
  return ok({ ok: true, to: res.to, dryRun: !!res.dryRun });
}
