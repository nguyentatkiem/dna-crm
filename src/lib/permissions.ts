// Phân quyền phía server. Phần thuần (danh mục quyền, vai trò, phạm vi) nằm ở ./roles.
//
// Dùng mới:   const acc = await accessOf(ctx);  allow(acc, "record_delete");  await recordScope(ctx)
// Code cũ:    can(role, "delete") + getRole(...) vẫn chạy (vai trò tự tạo được quy về vai trò gốc).
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { getPref } from "./prefs";
import { listTeams } from "./perf/teams";
import { allow, BUILTIN_COLOR, BUILTIN_LABEL, BUILTIN_ROLES, isBuiltin, ownerWhere, resolveAccess, roleDefs, visibleOwners, type Access, type BuiltinRole, type Perm, type RolesPref } from "./roles";

export { allow, ownerVisible, visibleOwners, ownerWhere, PERM_LABEL, MODULES, type Access, type Perm, type Scope } from "./roles";

// ---------- Tương thích ngược (code cũ) ----------

export type Role = BuiltinRole;
export const ROLES: Role[] = BUILTIN_ROLES;
export const ROLE_LABEL: Record<Role, string> = BUILTIN_LABEL;
export const ROLE_COLOR: Record<Role, string> = BUILTIN_COLOR;

/** Quyền kiểu cũ (9 quyền). Code mới dùng allow(access, perm). */
export type Action = "manage_settings" | "manage_members" | "see_all" | "delete" | "export" | "import" | "review_calls" | "manage_marketing" | "manage_automations";

const RULES: Record<Role, Action[]> = {
  owner: ["manage_settings", "manage_members", "see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  manager: ["see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  member: [],
};

/** Quyền cũ → quyền mới tương ứng (dùng cho legacyAllow). */
export const LEGACY_MAP: Record<Action, Perm> = {
  manage_settings: "settings_manage",
  manage_members: "members_manage",
  see_all: "perf_view_team",
  delete: "record_delete",
  export: "record_export",
  import: "record_import",
  review_calls: "calls_review",
  manage_marketing: "marketing_manage",
  manage_automations: "automations_manage",
};

/** Vai trò có sẵn từ khoá lưu trong Membership (vai trò tự tạo / lạ → "member"; xem getAccess để có quyền thật). */
export const asRole = (r: string | null | undefined): Role => (isBuiltin(r) ? r : "member");

/** @deprecated Dùng allow(await accessOf(ctx), perm). Chỉ đúng với mặc định của vai trò có sẵn. */
export function can(role: Role, action: Action) {
  return RULES[role]?.includes(action) ?? false;
}

/**
 * Vai trò gốc (owner / manager / member) của người dùng — dùng cho quyền theo trường, che SĐT và code cũ.
 * Vai trò tự tạo trả về vai trò gốc đã chọn khi tạo; vai trò lạ trả "member".
 */
export async function getRole(userId: string, workspaceId: string): Promise<Role> {
  return (await getAccess(userId, workspaceId)).base;
}

// ---------- Quyền thực tế ----------

export const rolesPref = (workspaceId: string) => getPref<RolesPref>(workspaceId, "roles", {});

/** Chủ đã bật "Nhân viên chỉ thấy khách của mình" (cài đặt cũ) — chỉ còn là mặc định phạm vi của Nhân viên. */
export const memberSeesOwnOnly = (ws: { settingsJson: string }) => getSettings(ws).permissions?.memberSeesOwnOnly === "1";

/** Mọi vai trò của workspace (Chủ, Quản lý, Nhân viên, vai trò tự tạo) với quyền thực tế. */
export async function workspaceRoles(workspaceId: string) {
  const [pref, ws] = await Promise.all([rolesPref(workspaceId), db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } })]);
  return roleDefs(pref, ws ? memberSeesOwnOnly(ws) : false);
}

/** Quyền thực tế của một người trong workspace (nhớ trong một lần render server). */
export const getAccess = cache(async (userId: string, workspaceId: string): Promise<Access> => {
  const [m, ws, pref, teams] = await Promise.all([
    db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, include: { user: { select: { name: true } } } }),
    db.workspace.findUnique({ where: { id: workspaceId }, select: { settingsJson: true } }),
    rolesPref(workspaceId),
    listTeams(workspaceId).catch(() => []),
  ]);
  if (!m) return resolveAccess({ roleKey: null, user: { id: userId, name: "" } });
  return resolveAccess({ roleKey: m.role, pref, legacyOwnOnly: ws ? memberSeesOwnOnly(ws) : false, user: { id: userId, name: m.user.name }, teams });
});

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson?: string } };
const memo = new WeakMap<object, Promise<Access>>();

/** Quyền của người đang đăng nhập (nhớ theo object ctx của request). */
export function accessOf(ctx: Ctx): Promise<Access> {
  let p = memo.get(ctx);
  if (!p) {
    p = getAccess(ctx.user.id, ctx.workspace.id);
    memo.set(ctx, p);
  }
  return p;
}

/** Tiện cho route: có quyền không. */
export const allowed = async (ctx: Ctx, p: Perm) => allow(await accessOf(ctx), p);

/** userId của những thành viên có quyền p (vd. báo người duyệt báo giá). */
export async function membersWith(workspaceId: string, p: Perm) {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { userId: true } });
  const out: string[] = [];
  for (const m of ms) if (allow(await getAccess(m.userId, workspaceId), p)) out.push(m.userId);
  return out;
}

// ---------- Phạm vi dữ liệu ----------

/**
 * Điều kiện lọc Record theo phạm vi của vai trò: "all" thấy hết; "team" thấy mục của người cùng đội;
 * "own" chỉ mục mình phụ trách. Cả hai cái sau có thể gồm mục chưa ai nhận. Luôn ghép với workspaceId.
 */
export async function recordScope(ctx: Ctx): Promise<Prisma.RecordWhereInput> {
  const base: Prisma.RecordWhereInput = { workspaceId: ctx.workspace.id };
  const w = ownerWhere(await accessOf(ctx), "ownerName");
  return w ? { ...base, ...w } : base;
}

/** Lấy một Record nếu người dùng được phép thấy nó (ngoài phạm vi coi như không tồn tại). */
export async function findScopedRecord(ctx: Ctx, id: string) {
  const scope = await recordScope(ctx);
  return db.record.findFirst({ where: { AND: [scope, { id }] } });
}

/** Người này có xem được dữ liệu của `name` không (KPI, hoa hồng, cuộc gọi...). */
export async function canSeePerson(ctx: Ctx, name: string) {
  const a = await accessOf(ctx);
  if (name === a.userName) return true;
  const names = visibleOwners(a);
  return !names || names.includes(name);
}

/**
 * Điều kiện lọc Task cho "Việc của tôi".
 * who = "mine" (mặc định): việc giao cho mình, việc của mục mình phụ trách, việc chưa giao (trong phạm vi).
 * who = "all" hoặc tên một người: cần quyền "Xem việc của người khác", và vẫn bị giới hạn theo phạm vi dữ liệu.
 */
export async function taskScope(ctx: Ctx, who = "mine"): Promise<Prisma.TaskWhereInput> {
  const wid = ctx.workspace.id;
  const base: Prisma.TaskWhereInput = { workspaceId: wid };
  const acc = await accessOf(ctx);
  const others = allow(acc, "task_view_others");
  const names = visibleOwners(acc);
  // Việc chưa giao nhưng gắn với khách ngoài phạm vi thì không thấy.
  const unassignedCond = async (): Promise<Prisma.TaskWhereInput> => {
    if (!names) return { assignee: "" };
    const hidden = await db.record.findMany({ where: { workspaceId: wid, NOT: (await recordScope(ctx)) }, select: { id: true } });
    return { assignee: "", OR: [{ recordId: null }, { recordId: { notIn: hidden.map((r) => r.id) } }] };
  };

  if (others && who === "all") {
    if (!names) return base;
    const inScope = await db.record.findMany({ where: await recordScope(ctx), select: { id: true } });
    return { ...base, OR: [{ assignee: { in: names } }, { recordId: { in: inScope.map((r) => r.id) } }, await unassignedCond()] };
  }
  if (others && who !== "mine" && (!names || names.includes(who))) return { ...base, assignee: who };

  const mine = await db.record.findMany({ where: { workspaceId: wid, ownerName: ctx.user.name }, select: { id: true } });
  return { ...base, OR: [{ assignee: ctx.user.name }, { recordId: { in: mine.map((r) => r.id) } }, await unassignedCond()] };
}

/**
 * Cuộc gọi thấy được: không có quyền "Nghe ghi âm của người khác" thì chỉ cuộc gọi của mình;
 * có quyền thì theo phạm vi dữ liệu (own / team / all).
 */
export async function callScope(ctx: Ctx): Promise<Prisma.CallWhereInput> {
  const acc = await accessOf(ctx);
  const base: Prisma.CallWhereInput = { workspaceId: ctx.workspace.id };
  if (!allow(acc, "calls_listen_others")) return { ...base, agentName: acc.userName };
  const names = visibleOwners(acc);
  return names ? { ...base, agentName: { in: names } } : base;
}
