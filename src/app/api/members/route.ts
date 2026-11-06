import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow, memberSeesOwnOnly, workspaceRoles } from "@/lib/permissions";
import { permissionMatrix } from "@/lib/roles";
import { audit } from "@/lib/audit";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [members, invites, acc, defs] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } }),
    db.invite.findMany({ where: { workspaceId: wid, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    accessOf(a.ctx),
    workspaceRoles(wid),
  ]);
  const team = a.ctx.config.team;
  const order = (k: string) => {
    const i = defs.findIndex((d) => d.key === k);
    return i < 0 ? defs.length : i;
  };
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const member = defs.find((d) => d.key === "member");
  return ok({
    me: a.ctx.user.id,
    myRole: acc.role,
    myRoleName: acc.roleName,
    isOwner: acc.isOwner,
    canManageSettings: allow(acc, "roles_manage"),
    canSeeAudit: allow(acc, "audit_view"),
    roles: defs.map((d) => ({ key: d.key, label: d.name, color: d.color, builtin: d.builtin })),
    matrix: permissionMatrix(defs),
    memberSeesOwnOnly: member ? member.scope === "own" : memberSeesOwnOnly(a.ctx.workspace),
    team,
    members: members
      .sort((x, y) => order(x.role) - order(y.role) || x.user.createdAt.getTime() - y.user.createdAt.getTime())
      .map((m) => ({ ...m.user, role: m.role, roleName: byKey.get(m.role)?.name ?? "Vai trò không xác định", roleColor: byKey.get(m.role)?.color ?? "#c4c4c4", inTeam: team.includes(m.user.name) })),
    invites: invites.map((i) => ({ token: i.token, role: i.role, roleName: byKey.get(i.role)?.name ?? i.role, expiresAt: i.expiresAt })),
  });
}

/** Tạo link mời dùng một lần, hết hạn sau 7 ngày (chỉ chủ). Body tuỳ chọn: { role: khoá vai trò, trừ "owner" }. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "members_manage")) return fail("Chỉ chủ workspace được mời thành viên", 403);
  const body = (await req.json().catch(() => ({}))) as { role?: string };
  const defs = await workspaceRoles(a.ctx.workspace.id);
  const key = body.role ?? "member";
  const def = defs.find((d) => d.key === key);
  if (!def || def.key === "owner") return fail("Vai trò không hợp lệ");
  const token = randomBytes(18).toString("base64url");
  await db.invite.create({ data: { token, role: def.key, workspaceId: a.ctx.workspace.id, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "member.invite", "member", token.slice(0, 8), `Tạo link mời vai trò ${def.name}`);
  const origin = new URL(req.url).origin;
  return ok({ url: `${origin}/register?invite=${token}` }, 201);
}
