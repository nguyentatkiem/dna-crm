import type { Prisma, Warranty } from "@prisma/client";
import { db } from "../db";
import { EXPIRING_DAYS, normPhone } from "./shared";

export type WarrantyDTO = { id: string; recordId: string | null; productId: string | null; orderId: string | null; productName: string; serial: string; customerName: string; phone: string; startAt: string; endAt: string; status: string; note: string; createdAt: string };

export const warrantyDTO = (w: Warranty): WarrantyDTO => ({
  id: w.id,
  recordId: w.recordId,
  productId: w.productId,
  orderId: w.orderId,
  productName: w.productName,
  serial: w.serial,
  customerName: w.customerName,
  phone: w.phone,
  startAt: w.startAt.toISOString(),
  endAt: w.endAt.toISOString(),
  status: w.status,
  note: w.note,
  createdAt: w.createdAt.toISOString(),
});

/** Điều kiện lọc phiếu bảo hành: tìm theo SĐT/serial/tên khách/sản phẩm, trạng thái, sắp hết hạn. */
export function warrantyWhere(workspaceId: string, o: { q?: string; status?: string; expiring?: boolean }, now = new Date()): Prisma.WarrantyWhereInput {
  const and: Prisma.WarrantyWhereInput[] = [{ workspaceId }];
  const q = (o.q ?? "").trim();
  if (q) {
    const digits = normPhone(q);
    and.push({ OR: [{ serial: { contains: q } }, { customerName: { contains: q } }, { productName: { contains: q } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] });
  }
  if (o.status && o.status !== "all") and.push({ status: o.status });
  if (o.expiring) and.push({ status: "active", endAt: { gte: now, lte: new Date(now.getTime() + EXPIRING_DAYS * 864e5) } });
  return { AND: and };
}

export async function warrantyCounts(workspaceId: string, now = new Date()) {
  const [g, expiring] = await Promise.all([
    db.warranty.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
    db.warranty.count({ where: warrantyWhere(workspaceId, { expiring: true }, now) }),
  ]);
  const c = (s: string) => g.find((x) => x.status === s)?._count._all ?? 0;
  return { all: g.reduce((n, x) => n + x._count._all, 0), active: c("active"), claimed: c("claimed"), expired: c("expired"), void: c("void"), expiring };
}
