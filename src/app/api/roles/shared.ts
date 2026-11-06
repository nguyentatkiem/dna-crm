// Phần dùng chung của API vai trò: chỉ chủ workspace được quản lý vai trò (chống tự nâng quyền).
import { db } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { accessOf, allow, memberSeesOwnOnly, rolesPref } from "@/lib/permissions";
import { setPref } from "@/lib/prefs";
import { normalizeRolesPref, permissionMatrix, roleDefs, type RolesPref } from "@/lib/roles";

export async function ownerApi() {
  const a = await appApi();
  if ("error" in a) return a;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "roles_manage")) return { error: fail("Chỉ chủ workspace được quản lý vai trò", 403) } as const;
  return { ctx: a.ctx, acc } as const;
}

export async function loadRoles(workspaceId: string, settingsJson: string) {
  const raw = await rolesPref(workspaceId);
  const pref = normalizeRolesPref(raw);
  const legacy = memberSeesOwnOnly({ settingsJson });
  return { pref, legacy, defs: roleDefs(pref, legacy) };
}

export const saveRoles = (workspaceId: string, pref: RolesPref) => setPref(workspaceId, "roles", pref);

/** Số thành viên và link mời đang dùng mỗi vai trò. */
export async function roleUsage(workspaceId: string) {
  const [ms, invites] = await Promise.all([
    db.membership.groupBy({ by: ["role"], where: { workspaceId }, _count: { _all: true } }),
    db.invite.groupBy({ by: ["role"], where: { workspaceId, usedAt: null, expiresAt: { gt: new Date() } }, _count: { _all: true } }),
  ]);
  const out: Record<string, { members: number; invites: number }> = {};
  for (const m of ms) out[m.role] = { members: m._count._all, invites: 0 };
  for (const i of invites) out[i.role] = { members: out[i.role]?.members ?? 0, invites: i._count._all };
  return out;
}

export async function rolesView(workspaceId: string, settingsJson: string) {
  const [{ defs }, usage] = await Promise.all([loadRoles(workspaceId, settingsJson), roleUsage(workspaceId)]);
  return { roles: defs.map((d) => ({ ...d, members: usage[d.key]?.members ?? 0, invites: usage[d.key]?.invites ?? 0 })), matrix: permissionMatrix(defs) };
}
