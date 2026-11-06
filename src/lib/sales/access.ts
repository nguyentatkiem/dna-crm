// Phạm vi xem chứng từ bán hàng (báo giá, đơn hàng, hợp đồng) theo vai trò.
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { can, getRole, memberSeesOwnOnly, recordScope, type Role } from "@/lib/permissions";
import type { WorkspaceConfig } from "@/lib/config/schema";
import { customerOf } from "./customers";

export type SalesCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };
type DocWhere = { workspaceId: string; OR?: ({ createdBy: string } | { recordId: { in: string[] } } | { contactId: { in: string[] } })[] };

/**
 * Chủ/quản lý thấy mọi chứng từ. Nhân viên: nếu chủ chưa bật "chỉ thấy khách của mình" thì cũng thấy hết
 * (giống bảng khách); nếu đã bật thì chỉ thấy chứng từ mình tạo hoặc gắn với khách/giao dịch trong phạm vi của mình.
 */
export async function docScope(ctx: SalesCtx): Promise<{ role: Role; seeAll: boolean; where: DocWhere }> {
  const role = await getRole(ctx.user.id, ctx.workspace.id);
  const seeAll = can(role, "see_all");
  const where: DocWhere = { workspaceId: ctx.workspace.id };
  if (seeAll || !memberSeesOwnOnly(ctx.workspace)) return { role, seeAll, where };
  const ids = (await db.record.findMany({ where: await recordScope(ctx), select: { id: true } })).map((r) => r.id);
  where.OR = [{ createdBy: ctx.user.name }, { recordId: { in: ids } }, { contactId: { in: ids } }];
  return { role, seeAll, where };
}

/** Gộp phạm vi với điều kiện riêng (Prisma where của Quote/Order/Contract đều có các trường này). */
export const scoped = <T extends object>(s: DocWhere, extra: T) => ({ AND: [s, extra] });

/** Chỉ người tạo hoặc chủ/quản lý được sửa chứng từ. */
export const canEditDoc = (ctx: SalesCtx, seeAll: boolean, doc: { createdBy: string }) => seeAll || doc.createdBy === ctx.user.name;

/** userId của chủ và quản lý, để báo khi có báo giá chờ duyệt. */
export async function managerIds(workspaceId: string) {
  const ms = await db.membership.findMany({ where: { workspaceId, role: { in: ["owner", "manager"] } }, select: { userId: true } });
  return ms.map((m) => m.userId);
}

/** Chỉ giữ liên kết khách/giao dịch mà người dùng được phép thấy; còn lại bỏ trống. */
export async function visibleLinks(ctx: SalesCtx, links: { contactId?: string | null; recordId?: string | null }) {
  const ids = [links.contactId, links.recordId].filter((x): x is string => !!x);
  if (!ids.length) return { contactId: null, recordId: null };
  const recs = await db.record.findMany({ where: { AND: [await recordScope(ctx), { id: { in: ids } }] }, select: { id: true, objectKey: true } });
  const has = (id?: string | null) => (id && recs.some((r) => r.id === id) ? id : null);
  return { contactId: has(links.contactId), recordId: has(links.recordId) };
}

/** Lọc chứng từ gắn với một record (theo giao dịch hoặc theo khách). */
export const linkedTo = (recordId: string) => ({ OR: [{ recordId }, { contactId: recordId }] });

/** Báo cho chủ và quản lý (báo giá chờ duyệt...). */
export async function notifyManagers(workspaceId: string, quoteId: string, text: string) {
  for (const userId of await managerIds(workspaceId)) await notify(workspaceId, { userId, kind: "quote", text, href: `/w/quotes/${quoteId}` });
}

/**
 * Như visibleLinks, và nếu chỉ gắn giao dịch mà chưa gắn khách thì tự tìm khách của giao dịch
 * (để chứng từ hiện ở cả hồ sơ khách và để tích điểm đúng người).
 */
export async function resolveLinks(ctx: SalesCtx & { config: WorkspaceConfig }, links: { contactId?: string | null; recordId?: string | null }) {
  const v = await visibleLinks(ctx, links);
  if (v.recordId && !v.contactId) {
    const rec = await db.record.findFirst({ where: { id: v.recordId, workspaceId: ctx.workspace.id } });
    if (rec) {
      const c = await customerOf(ctx.workspace.id, ctx.config, rec);
      if (c.contactId) v.contactId = (await visibleLinks(ctx, { contactId: c.contactId })).contactId;
    }
  }
  return v;
}
