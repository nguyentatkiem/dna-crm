// HỢP ĐỒNG (nhóm "Chia hội thoại & thống kê" hoàn thiện): ai thấy hội thoại nào.
// Mọi chỗ liệt kê / mở hội thoại phải dùng hàm này (Hộp thư, API, thống kê).
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { conversationScope } from "../inbox";
import { accessOf, allow, ownerWhere } from "../permissions";
import { getPref } from "../prefs";
import { ASSIGN_DEFAULT, type InboxAssignPref } from "./assign-shared";

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

export type VisibilityMode = "scope" | "mine";

/**
 * Quy tắc (thuần):
 * - Chủ hoặc có quyền "Xem mọi hội thoại" → theo phạm vi dữ liệu như cũ ("scope").
 * - Không có quyền đó và bật "Nhân viên chỉ thấy hội thoại của mình" → của mình + chưa giao ("mine").
 * - Còn lại → như cũ ("scope").
 */
export function visibilityMode(o: { isOwner: boolean; viewAll: boolean; membersSeeOnlyMine: boolean }): VisibilityMode {
  if (o.isOwner || o.viewAll) return "scope";
  return o.membersSeeOnlyMine ? "mine" : "scope";
}

/** Điều kiện "của tôi hoặc chưa giao (mà khách gắn kèm không nằm ngoài phạm vi)". */
export function mineOrUnassignedWhere(workspaceId: string, me: string, hiddenRecordIds: string[]): Prisma.ConversationWhereInput {
  const unassigned: Prisma.ConversationWhereInput = hiddenRecordIds.length ? { assignee: "", OR: [{ recordId: null }, { recordId: { notIn: hiddenRecordIds } }] } : { assignee: "" };
  return { workspaceId, OR: [{ assignee: me }, unassigned] };
}

/** Điều kiện lọc Conversation theo quyền + chế độ chia hội thoại. */
export async function conversationWhere(ctx: Ctx): Promise<Prisma.ConversationWhereInput> {
  const [acc, pref] = await Promise.all([accessOf(ctx), getPref<Partial<InboxAssignPref>>(ctx.workspace.id, "inboxAssign", ASSIGN_DEFAULT)]);
  const mode = visibilityMode({ isOwner: acc.isOwner, viewAll: allow(acc, "inbox_view_all"), membersSeeOnlyMine: !!pref.membersSeeOnlyMine });
  if (mode === "scope") return conversationScope(ctx);
  const ow = ownerWhere(acc, "ownerName");
  const hidden = ow ? await db.record.findMany({ where: { workspaceId: ctx.workspace.id, NOT: ow }, select: { id: true } }) : [];
  return mineOrUnassignedWhere(ctx.workspace.id, ctx.user.name, hidden.map((h) => h.id));
}
