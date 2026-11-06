// Phần dùng chung của API voucher: quyền, DTO.
import type { Voucher, VoucherCampaign } from "@prisma/client";
import { can, getRole } from "../permissions";
import { effectiveStatus, valueText } from "./shared";

/** Tạo/sửa chiến dịch, phát hàng loạt, huỷ mã: chủ, quản lý (quyền marketing). */
export const canManageVouchers = async (ctx: { user: { id: string }; workspace: { id: string } }) => can(await getRole(ctx.user.id, ctx.workspace.id), "manage_marketing");

export function voucherDTO(v: Voucher & { campaign: VoucherCampaign }, titles: Map<string, { title: string; objectKey: string }>, orders?: Map<string, string>) {
  const rec = v.recordId ? titles.get(v.recordId) : undefined;
  return {
    id: v.id,
    code: v.code,
    campaignId: v.campaignId,
    campaign: v.campaign.name,
    value: valueText(v.campaign),
    status: effectiveStatus(v),
    reason: v.reason,
    recordId: v.recordId,
    customer: rec?.title ?? "",
    objectKey: rec?.objectKey ?? "contacts",
    expiresAt: v.expiresAt.toISOString(),
    usedAt: v.usedAt?.toISOString() ?? null,
    usedOrderId: v.usedOrderId,
    usedOrder: v.usedOrderId ? orders?.get(v.usedOrderId) ?? "" : "",
    discount: v.discount,
    sentVia: v.sentVia,
    createdAt: v.createdAt.toISOString(),
  };
}
export type VoucherDTO = ReturnType<typeof voucherDTO>;
