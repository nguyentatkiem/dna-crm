import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";

export type Role = "owner" | "manager" | "member";
export const ROLES: Role[] = ["owner", "manager", "member"];
export const ROLE_LABEL: Record<Role, string> = { owner: "Chủ", manager: "Quản lý", member: "Nhân viên" };
export const ROLE_COLOR: Record<Role, string> = { owner: "#a25ddc", manager: "#0086c0", member: "#579bfc" };

export type Action = "manage_settings" | "manage_members" | "see_all" | "delete" | "export" | "import" | "review_calls" | "manage_marketing" | "manage_automations";

const RULES: Record<Role, Action[]> = {
  owner: ["manage_settings", "manage_members", "see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  manager: ["see_all", "delete", "export", "import", "review_calls", "manage_marketing", "manage_automations"],
  member: [],
};

/** Mô tả quyền để hiển thị bảng ✓/– ở trang Thành viên. */
export const ACTION_LABEL: Record<Action, string> = {
  see_all: "Xem toàn bộ khách và việc của mọi người",
  delete: "Xoá khách, liệu trình, lịch hẹn",
  export: "Xuất dữ liệu ra Excel",
  import: "Nhập dữ liệu từ Excel",
  review_calls: "Chấm điểm và duyệt cuộc gọi",
  manage_marketing: "Quản lý marketing, chiến dịch",
  manage_automations: "Quản lý tự động hoá",
  manage_settings: "Sửa cài đặt, kết nối, phân quyền",
  manage_members: "Mời, đổi vai trò, xoá thành viên",
};
export const PERMISSION_TABLE = (Object.keys(ACTION_LABEL) as Action[]).map((a) => ({ action: a, label: ACTION_LABEL[a], owner: can("owner", a), manager: can("manager", a), member: can("member", a) }));

export const asRole = (r: string | null | undefined): Role => (r === "owner" || r === "manager" ? r : "member");

export function can(role: Role, action: Action) {
  return RULES[role]?.includes(action) ?? false;
}

export async function getRole(userId: string, workspaceId: string): Promise<Role> {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  return asRole(m?.role);
}

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/** Chủ đã bật "Nhân viên chỉ thấy khách của mình" chưa. */
export const memberSeesOwnOnly = (ws: { settingsJson: string }) => getSettings(ws).permissions?.memberSeesOwnOnly === "1";

/**
 * Điều kiện lọc Record theo quyền. Khi chủ bật "Nhân viên chỉ thấy khách của mình",
 * nhân viên chỉ thấy mục mình phụ trách và mục chưa ai nhận. Luôn ghép với workspaceId.
 */
export async function recordScope(ctx: Ctx): Promise<Prisma.RecordWhereInput> {
  const base: Prisma.RecordWhereInput = { workspaceId: ctx.workspace.id };
  if (!memberSeesOwnOnly(ctx.workspace)) return base;
  const role = await getRole(ctx.user.id, ctx.workspace.id);
  if (can(role, "see_all")) return base;
  return { ...base, OR: [{ ownerName: ctx.user.name }, { ownerName: "" }] };
}

/** Lấy một Record nếu người dùng được phép thấy nó (ngoài phạm vi coi như không tồn tại). */
export async function findScopedRecord(ctx: Ctx, id: string) {
  const scope = await recordScope(ctx);
  return db.record.findFirst({ where: { AND: [scope, { id }] } });
}

/**
 * Điều kiện lọc Task cho "Việc của tôi".
 * who = "mine" (mặc định): việc giao cho mình, việc của mục mình phụ trách, việc chưa giao.
 * who = "all" hoặc tên một người: chỉ chủ/quản lý dùng được, nhân viên luôn bị ép về "mine".
 */
export async function taskScope(ctx: Ctx, who = "mine"): Promise<Prisma.TaskWhereInput> {
  const wid = ctx.workspace.id;
  const base: Prisma.TaskWhereInput = { workspaceId: wid };
  const role = await getRole(ctx.user.id, wid);
  const seeAll = can(role, "see_all");
  if (seeAll && who === "all") return base;
  if (seeAll && who !== "mine") return { ...base, assignee: who };

  const mine = await db.record.findMany({ where: { workspaceId: wid, ownerName: ctx.user.name }, select: { id: true } });
  let unassigned: Prisma.TaskWhereInput = { assignee: "" };
  if (!seeAll && memberSeesOwnOnly(ctx.workspace)) {
    // Việc chưa giao nhưng gắn với khách của người khác thì nhân viên không thấy.
    const hidden = await db.record.findMany({ where: { workspaceId: wid, ownerName: { notIn: [ctx.user.name, ""] } }, select: { id: true } });
    unassigned = { assignee: "", OR: [{ recordId: null }, { recordId: { notIn: hidden.map((r) => r.id) } }] };
  }
  return { ...base, OR: [{ assignee: ctx.user.name }, { recordId: { in: mine.map((r) => r.id) } }, unassigned] };
}
