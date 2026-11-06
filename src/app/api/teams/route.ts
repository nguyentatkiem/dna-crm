import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { createTeam, knownPeople, listTeams } from "@/lib/perf/teams";
import { perfRole } from "@/lib/perf/server";
import { TeamBody } from "@/lib/perf/schemas";

/** Danh sách đội + tên người đã biết trong workspace (để chọn thành viên). Mọi thành viên xem được. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const [teams, people, r] = await Promise.all([listTeams(a.ctx.workspace.id), knownPeople(a.ctx.workspace.id, a.ctx.config.team), perfRole(a.ctx)]);
  return ok({ teams, people, canManage: r.manager });
}

/** Tạo đội (chủ, quản lý). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await perfRole(a.ctx)).manager) return fail("Chỉ chủ và quản lý được sửa phòng ban / đội", 403);
  const p = TeamBody.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const t = await createTeam(a.ctx.workspace.id, p.data);
  if ("error" in t) return fail(t.error);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "team.create", "team", t.id, `Tạo đội “${t.name}” (${t.members.length + (t.leader ? 1 : 0)} người)`);
  return ok(t, 201);
}
