import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { actionDiff, cleanActions, PERM_LABEL, SCOPE_LABEL, type Perm, type RoleDef } from "@/lib/roles";
import { loadRoles, ownerApi, roleUsage, rolesView, saveRoles } from "../shared";

type Ctx = { params: Promise<{ key: string }> };

const Patch = z.object({
  name: z.string().trim().min(1, "Nhập tên vai trò").max(40, "Tên vai trò tối đa 40 ký tự").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  base: z.enum(["manager", "member"]).optional(),
  actions: z.array(z.string()).max(200).optional(),
  scope: z.enum(["own", "team", "all"]).optional(),
  unassigned: z.boolean().optional(),
  /** Vai trò có sẵn (Quản lý / Nhân viên): về lại quyền mặc định. */
  reset: z.boolean().optional(),
});

const label = (xs: string[]) => xs.map((x) => PERM_LABEL[x as Perm] ?? x);

/** Ghi nhật ký: quyền thêm / bớt, phạm vi, tên. */
async function logChange(g: { ctx: { workspace: { id: string }; user: { id: string; name: string } } }, before: RoleDef, after: RoleDef) {
  const d = actionDiff(before.actions, after.actions);
  const parts: string[] = [];
  if (d.added.length) parts.push(`thêm ${d.added.length} quyền`);
  if (d.removed.length) parts.push(`bỏ ${d.removed.length} quyền`);
  if (before.scope !== after.scope) parts.push(`phạm vi ${SCOPE_LABEL[before.scope]} → ${SCOPE_LABEL[after.scope]}`);
  if (before.unassigned !== after.unassigned) parts.push(after.unassigned ? "thấy mục chưa giao" : "không thấy mục chưa giao");
  if (before.name !== after.name) parts.push(`đổi tên → “${after.name}”`);
  if (before.base !== after.base) parts.push(`vai trò gốc → ${after.base === "manager" ? "Quản lý" : "Nhân viên"}`);
  if (before.color !== after.color) parts.push("đổi màu");
  if (!parts.length) return;
  await audit({ workspaceId: g.ctx.workspace.id, user: g.ctx.user }, "role.update", "role", after.key, `Sửa vai trò “${before.name}”: ${parts.join(", ")}`, {
    actions: { added: label(d.added), removed: label(d.removed) },
    ...(before.scope !== after.scope ? { scope: [SCOPE_LABEL[before.scope], SCOPE_LABEL[after.scope]] } : {}),
    ...(before.name !== after.name ? { name: [before.name, after.name] } : {}),
  });
}

/** Sửa vai trò (chỉ chủ). Vai trò Chủ không sửa được; Quản lý / Nhân viên lưu thành chỉnh sửa đè lên mặc định. */
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await ownerApi();
  if ("error" in g) return g.error;
  const { key } = await params;
  if (key === "owner") return fail("Vai trò Chủ luôn có toàn quyền, không sửa được");
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const wid = g.ctx.workspace.id;
  const { pref, defs } = await loadRoles(wid, g.ctx.workspace.settingsJson);
  const before = defs.find((d) => d.key === key);
  if (!before) return fail("Không tìm thấy vai trò", 404);
  const b = p.data;

  if (key === "manager" || key === "member") {
    const ov = { ...(pref.overrides[key] ?? {}) };
    if (b.reset) delete pref.overrides[key];
    else {
      if (b.actions) ov.actions = cleanActions(b.actions);
      if (b.scope) ov.scope = b.scope;
      if (b.unassigned !== undefined) ov.unassigned = b.unassigned;
      pref.overrides[key] = ov;
    }
  } else {
    const i = pref.roles.findIndex((r) => r.key === key);
    const name = b.name?.replace(/\s+/g, " ");
    if (name && defs.some((d) => d.key !== key && d.name.toLowerCase() === name.toLowerCase())) return fail(`Đã có vai trò “${name}”`);
    const cur = pref.roles[i];
    pref.roles[i] = {
      ...cur,
      ...(name ? { name } : {}),
      ...(b.color ? { color: b.color } : {}),
      ...(b.base ? { base: b.base } : {}),
      ...(b.actions ? { actions: cleanActions(b.actions) } : {}),
      ...(b.scope ? { scope: b.scope } : {}),
      ...(b.unassigned !== undefined ? { unassigned: b.unassigned } : {}),
    };
  }
  await saveRoles(wid, pref);
  const after = (await loadRoles(wid, g.ctx.workspace.settingsJson)).defs.find((d) => d.key === key)!;
  await logChange(g, before, after);
  return ok({ role: after, ...(await rolesView(wid, g.ctx.workspace.settingsJson)) });
}

/**
 * Xoá vai trò tự tạo (chỉ chủ). Đang có thành viên / link mời dùng thì cần { reassignTo: "<khoá vai trò>" }
 * để chuyển họ sang vai trò khác trước; nếu không trả 409 kèm số người đang dùng.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await ownerApi();
  if ("error" in g) return g.error;
  const { key } = await params;
  const wid = g.ctx.workspace.id;
  const { pref, defs } = await loadRoles(wid, g.ctx.workspace.settingsJson);
  const role = pref.roles.find((r) => r.key === key);
  if (!role) return fail(defs.some((d) => d.key === key) ? "Không xoá được vai trò có sẵn" : "Không tìm thấy vai trò", defs.some((d) => d.key === key) ? 400 : 404);
  const body = (await req.json().catch(() => ({}))) as { reassignTo?: string };
  const used = (await roleUsage(wid))[key] ?? { members: 0, invites: 0 };
  const target = body.reassignTo ? defs.find((d) => d.key === body.reassignTo && d.key !== key) : undefined;
  if (used.members + used.invites > 0) {
    if (!body.reassignTo) return ok({ error: `Vai trò “${role.name}” đang được ${used.members} thành viên${used.invites ? ` và ${used.invites} link mời` : ""} dùng. Hãy chọn vai trò để chuyển họ sang.`, inUse: used }, 409);
    if (!target) return fail("Vai trò chuyển sang không hợp lệ");
    if (target.key === "owner") return fail("Không chuyển hàng loạt thành Chủ được. Hãy đổi từng người ở trang Thành viên.");
    const moved = await db.membership.findMany({ where: { workspaceId: wid, role: key }, select: { userId: true } });
    await db.membership.updateMany({ where: { workspaceId: wid, role: key }, data: { role: target.key } });
    await db.invite.updateMany({ where: { workspaceId: wid, role: key, usedAt: null }, data: { role: target.key } });
    for (const m of moved) if (m.userId !== g.ctx.user.id) await notify(wid, { userId: m.userId, kind: "system", text: `${g.ctx.user.name} chuyển vai trò của bạn thành ${target.name}`, href: "/w/settings" });
  }
  await saveRoles(wid, { ...pref, roles: pref.roles.filter((r) => r.key !== key) });
  await audit({ workspaceId: wid, user: g.ctx.user }, "role.delete", "role", key, `Xoá vai trò “${role.name}”${target ? `, chuyển ${used.members} thành viên sang “${target.name}”` : ""}`, {
    actions: { added: [], removed: label(role.actions) },
  });
  return ok({ deleted: true, ...(await rolesView(wid, g.ctx.workspace.settingsJson)) });
}
