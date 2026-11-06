import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { deleteTeam, getTeam, updateTeam } from "@/lib/perf/teams";
import { allowed } from "@/lib/permissions";
import { TeamBody } from "@/lib/perf/schemas";

type P = { params: Promise<{ id: string }> };

/** Sửa đội (chủ, quản lý). */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "teams_manage"))) return fail("Bạn chưa có quyền sửa phòng ban / đội", 403);
  const { id } = await params;
  const p = TeamBody.partial().safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const before = await getTeam(a.ctx.workspace.id, id);
  if (!before) return fail("Không tìm thấy đội", 404);
  const t = await updateTeam(a.ctx.workspace.id, id, { ...before, ...p.data });
  if ("error" in t) return fail(t.error);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "team.update", "team", t.id, `Sửa đội “${t.name}”`, diffOf({ name: before.name, leader: before.leader, members: before.members.join(", "), color: before.color }, { name: t.name, leader: t.leader, members: t.members.join(", "), color: t.color }));
  return ok(t);
}

/** Xoá đội: gỡ đội khỏi phiếu hỗ trợ, xoá chỉ tiêu KPI của đội. */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "teams_manage"))) return fail("Bạn chưa có quyền sửa phòng ban / đội", 403);
  const t = await deleteTeam(a.ctx.workspace.id, (await params).id);
  if (!t) return fail("Không tìm thấy đội", 404);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "team.delete", "team", t.id, `Xoá đội “${t.name}”`);
  return ok({ ok: true });
}
