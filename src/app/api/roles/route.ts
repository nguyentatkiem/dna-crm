import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { accessOf, allow } from "@/lib/permissions";
import { cleanActions, PERM_LABEL, roleKeyFrom, SCOPE_LABEL, type Perm } from "@/lib/roles";
import { loadRoles, ownerApi, rolesView, saveRoles } from "./shared";

/** Danh sách vai trò + ma trận quyền. Ai trong workspace cũng xem được (để biết mình có quyền gì); chỉ chủ sửa. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const acc = await accessOf(a.ctx);
  const view = await rolesView(a.ctx.workspace.id, a.ctx.workspace.settingsJson);
  return ok({ ...view, canManage: allow(acc, "roles_manage"), me: { role: acc.role, roleName: acc.roleName, scope: acc.scope, actions: [...acc.actions] } });
}

const Body = z.object({
  name: z.string().trim().min(1, "Nhập tên vai trò").max(40, "Tên vai trò tối đa 40 ký tự"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  base: z.enum(["manager", "member"]).optional(),
  actions: z.array(z.string()).max(200).optional(),
  scope: z.enum(["own", "team", "all"]).optional(),
  unassigned: z.boolean().optional(),
  /** Sao chép quyền + phạm vi từ một vai trò có sẵn / tự tạo. */
  copyFrom: z.string().max(60).optional(),
});

/** Tạo vai trò tự đặt (chỉ chủ). */
export async function POST(req: Request) {
  const g = await ownerApi();
  if ("error" in g) return g.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const wid = g.ctx.workspace.id;
  const { pref, defs } = await loadRoles(wid, g.ctx.workspace.settingsJson);
  const name = p.data.name.replace(/\s+/g, " ");
  if (defs.some((d) => d.name.toLowerCase() === name.toLowerCase())) return fail(`Đã có vai trò “${name}”`);
  if (pref.roles.length >= 30) return fail("Tối đa 30 vai trò tự tạo");
  const src = p.data.copyFrom ? defs.find((d) => d.key === p.data.copyFrom) : undefined;
  if (p.data.copyFrom && !src) return fail("Không tìm thấy vai trò để sao chép", 404);
  const key = roleKeyFrom(name, defs.map((d) => d.key));
  const role = {
    key,
    name,
    color: p.data.color ?? "#579bfc",
    base: p.data.base ?? (src && src.base !== "owner" ? src.base : "member"),
    actions: cleanActions(p.data.actions ?? src?.actions ?? []),
    scope: p.data.scope ?? src?.scope ?? "own",
    unassigned: p.data.unassigned ?? src?.unassigned ?? true,
  };
  await saveRoles(wid, { ...pref, roles: [...pref.roles, role] });
  await audit({ workspaceId: wid, user: g.ctx.user }, "role.create", "role", key, `Tạo vai trò “${name}” (${role.actions.length} quyền, phạm vi: ${SCOPE_LABEL[role.scope]})${src ? `, sao chép từ “${src.name}”` : ""}`, {
    actions: { added: role.actions.map((x) => PERM_LABEL[x as Perm]), removed: [] },
    scope: ["", SCOPE_LABEL[role.scope]],
  });
  return ok({ role, ...(await rolesView(wid, g.ctx.workspace.settingsJson)) }, 201);
}
