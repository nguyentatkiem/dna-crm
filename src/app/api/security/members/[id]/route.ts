import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { accessOf } from "@/lib/permissions";
import { revokeAllSessions } from "@/lib/security/sessions";

type Ctx = { params: Promise<{ id: string }> };

/** Chủ workspace: số phiên đang mở của một thành viên. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  return ok({ active: await db.userSession.count({ where: { userId: id, revokedAt: null } }) });
}

/** Chủ workspace: đăng xuất thành viên khỏi mọi thiết bị (vd. mất điện thoại, nghỉ việc). Có thể mở khoá tạm. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const n = await revokeAllSessions(id, id === g.ctx.user.id ? g.ctx.sessionId || undefined : undefined);
  await db.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit({ workspaceId: g.ctx.workspace.id, user: g.ctx.user }, "auth.revoke_member", "member", id, `Đăng xuất ${g.name} khỏi ${n} phiên`);
  return ok({ revoked: n });
}

async function guard(id: string) {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  if (!(await accessOf(a.ctx)).isOwner) return { error: fail("Chỉ chủ workspace được làm việc này", 403) } as const;
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: id, workspaceId: a.ctx.workspace.id } }, include: { user: { select: { name: true } } } });
  if (!m) return { error: fail("Không tìm thấy thành viên", 404) } as const;
  return { ctx: a.ctx, name: m.user.name } as const;
}
