import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import type { WorkspaceConfig } from "@/lib/config/schema";

/**
 * Thêm tên thành viên vào danh sách đội (config.team) để giao khách, giao việc được.
 * Sửa trực tiếp cấu hình đang dùng (giống luồng đăng ký bằng link mời), không tạo phiên bản mới.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!allow(await getAccess(a.ctx.user.id, wid), "members_manage")) return fail("Chỉ chủ workspace được sửa danh sách đội", 403);
  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  const m = userId ? await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: wid } }, include: { user: { select: { name: true } } } }) : null;
  if (!m) return fail("Không tìm thấy thành viên", 404);
  const name = m.user.name.trim();
  const cfg = await db.workspaceConfig.findFirst({ where: { workspaceId: wid, isActive: true } });
  const c = parseJson<WorkspaceConfig | null>(cfg?.configJson, null);
  if (!cfg || !c) return fail("Workspace chưa có cấu hình", 409);
  if (c.team.includes(name)) return ok({ team: c.team });
  const team = [...c.team, name];
  await db.workspaceConfig.update({ where: { id: cfg.id }, data: { configJson: JSON.stringify({ ...c, team }) } });
  await audit({ workspaceId: wid, user: a.ctx.user }, "team.add", "team", userId!, `Thêm ${name} vào đội`, { team: [c.team.join(", "), team.join(", ")] });
  return ok({ team });
}
