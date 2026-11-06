import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { findScopedRecord } from "@/lib/permissions";
import { normCode } from "@/lib/voucher/shared";
import { canManageVouchers, voucherDTO } from "@/lib/voucher/api";
import { campaignsWithStats } from "@/lib/voucher/service";

/**
 * Danh sách mã đã phát (?status=&campaign=&q=), kèm chiến dịch và số liệu.
 * ?record=<id>: chỉ mã của một khách (thẻ trong hồ sơ khách), không kèm chiến dịch.
 * ?only=campaigns: chỉ danh sách chiến dịch (ô chọn khi phát mã).
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const sp = new URL(req.url).searchParams;
  if (sp.get("only") === "campaigns") return ok({ campaigns: await campaignsWithStats(wid) });
  const record = sp.get("record") ?? "";
  const status = sp.get("status") ?? "";
  const campaign = sp.get("campaign") ?? "";
  const q = normCode(sp.get("q") ?? "");
  const now = new Date();
  const where: Prisma.VoucherWhereInput = { workspaceId: wid };
  if (record) {
    const rec = await findScopedRecord(a.ctx, record);
    where.recordId = rec?.id ?? "-";
  }
  if (campaign) where.campaignId = campaign;
  // "issued" = còn hạn; "expired" gồm cả mã chưa kịp chạy job chuyển trạng thái.
  if (status === "issued") Object.assign(where, { status: "issued", expiresAt: { gte: now } });
  else if (status === "expired") where.OR = [{ status: "expired" }, { status: "issued", expiresAt: { lt: now } }];
  else if (status === "used" || status === "void") where.status = status;
  if (q) where.code = { contains: q };
  const rows = await db.voucher.findMany({ where, include: { campaign: true }, orderBy: { createdAt: "desc" }, take: 500 });
  const recIds = [...new Set(rows.map((v) => v.recordId).filter((x): x is string => !!x))];
  const orderIds = [...new Set(rows.map((v) => v.usedOrderId).filter((x): x is string => !!x))];
  const [recs, orders] = await Promise.all([
    recIds.length ? db.record.findMany({ where: { id: { in: recIds }, workspaceId: wid }, select: { id: true, title: true, objectKey: true } }) : [],
    orderIds.length ? db.order.findMany({ where: { id: { in: orderIds }, workspaceId: wid }, select: { id: true, number: true } }) : [],
  ]);
  const titles = new Map(recs.map((r) => [r.id, r]));
  const items = rows.map((v) => voucherDTO(v, titles, new Map(orders.map((o) => [o.id, o.number]))));
  if (record) return ok({ items });
  return ok({ items, campaigns: await campaignsWithStats(wid), canManage: await canManageVouchers(a.ctx) });
}
