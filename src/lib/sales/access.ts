// Phạm vi xem chứng từ bán hàng (báo giá, đơn hàng, hợp đồng) theo vai trò.
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { accessOf, allow, membersWith, recordScope, visibleOwners, type Access, type Role } from "@/lib/permissions";
import type { WorkspaceConfig } from "@/lib/config/schema";
import { customerOf } from "./customers";

export type SalesCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };
type DocWhere = { workspaceId: string; OR?: ({ createdBy: string | { in: string[] } } | { recordId: { in: string[] } } | { contactId: { in: string[] } })[] };

/** Quyền bán hàng đã tính sẵn cho trang/route. */
export type SalesPerm = {
  approve: boolean;
  editOthers: boolean;
  viewAll: boolean;
  create: boolean;
  orderEdit: boolean;
  cancelPaid: boolean;
  payRecord: boolean;
  payDelete: boolean;
  debtView: boolean;
  contract: boolean;
  del: boolean;
  products: boolean;
};

export const salesPerm = (acc: Access): SalesPerm => ({
  approve: allow(acc, "quote_approve"),
  editOthers: allow(acc, "sales_edit_others"),
  viewAll: allow(acc, "sales_view_all") || acc.scope === "all",
  create: allow(acc, "sales_create"),
  orderEdit: allow(acc, "order_edit"),
  cancelPaid: allow(acc, "order_cancel_paid"),
  payRecord: allow(acc, "payment_record"),
  payDelete: allow(acc, "payment_delete"),
  debtView: allow(acc, "debt_view"),
  contract: allow(acc, "contract_manage"),
  del: allow(acc, "sales_delete"),
  products: allow(acc, "product_manage"),
});

/**
 * Phạm vi chứng từ (báo giá, đơn, hợp đồng): ai có "Xem chứng từ của mọi người" hoặc phạm vi Toàn bộ thì thấy hết;
 * còn lại chỉ thấy chứng từ do mình / người cùng đội lập, hoặc gắn với khách/giao dịch trong phạm vi.
 * `seeAll` (tên cũ) = được sửa chứng từ của người khác.
 */
export async function docScope(ctx: SalesCtx): Promise<{ role: Role; access: Access; perm: SalesPerm; seeAll: boolean; where: DocWhere }> {
  const access = await accessOf(ctx);
  const perm = salesPerm(access);
  const where: DocWhere = { workspaceId: ctx.workspace.id };
  const out = { role: access.base, access, perm, seeAll: perm.editOthers, where };
  if (perm.viewAll) return out;
  const names = visibleOwners(access) ?? [ctx.user.name];
  const ids = (await db.record.findMany({ where: await recordScope(ctx), select: { id: true } })).map((r) => r.id);
  where.OR = [{ createdBy: names.length === 1 ? names[0] : { in: names } }, { recordId: { in: ids } }, { contactId: { in: ids } }];
  return out;
}

/** Gộp phạm vi với điều kiện riêng (Prisma where của Quote/Order/Contract đều có các trường này). */
export const scoped = <T extends object>(s: DocWhere, extra: T) => ({ AND: [s, extra] });

/** Người tạo hoặc người có quyền "Sửa chứng từ của người khác" được sửa chứng từ. */
export const canEditDoc = (ctx: SalesCtx, editOthers: boolean, doc: { createdBy: string }) => editOthers || doc.createdBy === ctx.user.name;

/** userId của những người duyệt được báo giá, để báo khi có báo giá chờ duyệt. */
export async function managerIds(workspaceId: string) {
  return membersWith(workspaceId, "quote_approve");
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
