import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";

export type Role = "owner" | "manager" | "member";
export const ROLE_LABEL: Record<Role, string> = { owner: "Chủ", manager: "Quản lý", member: "Nhân viên" };

export type Action = "manage_settings" | "manage_members" | "see_all" | "delete" | "export" | "import" | "review_calls" | "manage_marketing" | "manage_automations";

const RULES: Record<Role, Action[]> = {
  owner: ["manage_settings", "manage_members", "see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  manager: ["see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  member: [],
};

export function can(role: Role, action: Action) {
  return RULES[role]?.includes(action) ?? false;
}

export async function getRole(userId: string, workspaceId: string): Promise<Role> {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  const r = m?.role;
  return r === "owner" || r === "manager" ? r : "member";
}

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/**
 * Điều kiện lọc Record theo quyền. Khi chủ bật "Nhân viên chỉ thấy khách của mình",
 * nhân viên chỉ thấy mục mình phụ trách và mục chưa ai nhận. Luôn ghép với workspaceId.
 */
export async function recordScope(ctx: Ctx): Promise<Prisma.RecordWhereInput> {
  const base: Prisma.RecordWhereInput = { workspaceId: ctx.workspace.id };
  if (getSettings(ctx.workspace).permissions?.memberSeesOwnOnly !== "1") return base;
  const role = await getRole(ctx.user.id, ctx.workspace.id);
  if (can(role, "see_all")) return base;
  return { ...base, OR: [{ ownerName: ctx.user.name }, { ownerName: "" }] };
}
