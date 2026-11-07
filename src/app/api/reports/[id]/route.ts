import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canEditReport, findVisibleReport, memberNames, toDTO } from "@/lib/reports/service";
import { validateConfig } from "@/lib/reports/shared";
import { ReportBody } from "../body";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await findVisibleReport(a.ctx, (await params).id);
  if (!r) return fail("Không tìm thấy báo cáo", 404);
  const { names } = await memberNames(a.ctx.workspace.id);
  return ok(await toDTO(a.ctx, r, a.ctx.config, names));
}

/** Sửa tên, cấu hình, lịch gửi, người nhận, chia sẻ. Chỉ người tạo (có quyền "Báo cáo tự tạo") hoặc chủ. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await findVisibleReport(a.ctx, (await params).id);
  if (!r) return fail("Không tìm thấy báo cáo", 404);
  if (!(await canEditReport(a.ctx, r))) return fail("Bạn chỉ xem được báo cáo này", 403);
  const p = ReportBody.partial().safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.config !== undefined) {
    const v = validateConfig(d.config, a.ctx.config);
    if (!v.ok) return fail(v.error);
    data.configJson = JSON.stringify(v.config);
  }
  if (d.schedule !== undefined) data.scheduleJson = JSON.stringify(d.schedule);
  if (d.recipients !== undefined) data.recipientsJson = JSON.stringify([...new Set(d.recipients)]);
  if (d.shared !== undefined) data.shared = d.shared;
  const u = await db.report.update({ where: { id: r.id }, data });
  const { names } = await memberNames(a.ctx.workspace.id);
  return ok(await toDTO(a.ctx, u, a.ctx.config, names));
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await findVisibleReport(a.ctx, (await params).id);
  if (!r) return fail("Không tìm thấy báo cáo", 404);
  if (!(await canEditReport(a.ctx, r))) return fail("Bạn không xoá được báo cáo này", 403);
  await db.report.delete({ where: { id: r.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "report", r.id, `Xoá báo cáo “${r.name}”`);
  return ok({ ok: true });
}
