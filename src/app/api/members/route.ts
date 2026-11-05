import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { asRole, can, getRole, memberSeesOwnOnly, PERMISSION_TABLE, ROLE_LABEL, ROLES } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [members, invites, myRole] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } }),
    db.invite.findMany({ where: { workspaceId: wid, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    getRole(a.ctx.user.id, wid),
  ]);
  const team = a.ctx.config.team;
  return ok({
    me: a.ctx.user.id,
    myRole,
    isOwner: myRole === "owner",
    canManageSettings: can(myRole, "manage_settings"),
    roles: ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] })),
    permissions: PERMISSION_TABLE,
    memberSeesOwnOnly: memberSeesOwnOnly(a.ctx.workspace),
    team,
    members: members
      .sort((x, y) => ROLES.indexOf(asRole(x.role)) - ROLES.indexOf(asRole(y.role)) || x.user.createdAt.getTime() - y.user.createdAt.getTime())
      .map((m) => ({ ...m.user, role: asRole(m.role), inTeam: team.includes(m.user.name) })),
    invites: invites.map((i) => ({ token: i.token, role: asRole(i.role), expiresAt: i.expiresAt })),
  });
}

/** Tạo link mời dùng một lần, hết hạn sau 7 ngày. Body tuỳ chọn: { role: "member" | "manager" }. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "manage_members")) return fail("Chỉ chủ workspace được mời thành viên", 403);
  const body = (await req.json().catch(() => ({}))) as { role?: string };
  const role = body.role === "manager" ? "manager" : "member";
  const token = randomBytes(18).toString("base64url");
  await db.invite.create({ data: { token, role, workspaceId: a.ctx.workspace.id, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "member.invite", "member", token.slice(0, 8), `Tạo link mời vai trò ${ROLE_LABEL[role]}`);
  const origin = new URL(req.url).origin;
  return ok({ url: `${origin}/register?invite=${token}` }, 201);
}
