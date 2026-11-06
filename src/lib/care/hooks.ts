// Điểm nối giữa Bán hàng và Chăm sóc. Bán hàng gọi các hàm này khi đơn hàng hoàn tất;
// phần Chăm sóc (tích điểm, bảo hành) hiện thực bên trong.
import { db, parseJson } from "../db";
import { notify, userIdByName } from "../notify";
import { loyaltyPref } from "./server";
import { MAX_UNITS_PER_LINE, addMonths, normPhone, pointsFor, summarize, tierFor } from "./shared";

export type CompletedOrder = { id: string; number: string; workspaceId: string; contactId: string | null; customerName: string; customerPhone: string; total: number; itemsJson: string; createdBy: string };

type Line = { productId?: string | null; code?: string; name?: string; qty?: number };

/** Cộng điểm thưởng cho khách của đơn (nếu bật tích điểm). Trả về số điểm đã cộng. */
export async function awardPointsForOrder(order: CompletedOrder): Promise<number> {
  const wid = order.workspaceId;
  if (!order.contactId) return 0;
  const pref = await loyaltyPref(wid);
  if (!pref.enabled) return 0;
  const points = pointsFor(order.total, pref.vndPerPoint);
  if (points <= 0) return 0;
  // Gọi lại nhiều lần (đổi trạng thái qua lại) không được cộng hai lần.
  if (await db.loyaltyTxn.findFirst({ where: { workspaceId: wid, orderId: order.id }, select: { id: true } })) return 0;
  const contact = await db.record.findFirst({ where: { id: order.contactId, workspaceId: wid }, select: { id: true, title: true, ownerName: true } });
  if (!contact) return 0;

  const before = summarize(await db.loyaltyTxn.findMany({ where: { workspaceId: wid, recordId: contact.id }, select: { points: true, createdAt: true } }));
  await db.loyaltyTxn.create({ data: { workspaceId: wid, recordId: contact.id, points, reason: `Tích điểm đơn ${order.number}`, orderId: order.id, createdBy: order.createdBy || "Hệ thống" } });
  await db.order.updateMany({ where: { id: order.id, workspaceId: wid }, data: { pointsAwarded: points } }).catch(() => undefined);

  const oldTier = tierFor(before.earned, pref.tiers);
  const newTier = tierFor(before.earned + points, pref.tiers);
  const up = newTier.name !== oldTier.name && newTier.minPoints > oldTier.minPoints;
  await db.activity.create({
    data: { recordId: contact.id, kind: "update", body: `+${points} điểm từ đơn ${order.number}. Số dư: ${before.balance + points} điểm${up ? `. Lên hạng ${newTier.name}!` : ""}`, author: "Tích điểm" },
  });
  if (up) {
    const userId = await userIdByName(wid, contact.ownerName);
    await notify(wid, { userId, kind: "loyalty", text: `${contact.title} vừa lên hạng ${newTier.name} (ưu đãi ${newTier.discountPct}%)`, href: `/w/b/contacts?open=${contact.id}` });
  }
  return points;
}

/**
 * Tạo phiếu bảo hành cho các sản phẩm có thời hạn bảo hành trong đơn. Trả về số phiếu đã tạo.
 * Mỗi đơn vị một phiếu (để ghi serial riêng), tối đa MAX_UNITS_PER_LINE phiếu mỗi dòng hàng;
 * số lượng vượt quá ghi chú vào phiếu cuối.
 */
export async function createWarrantiesForOrder(order: CompletedOrder): Promise<number> {
  const wid = order.workspaceId;
  if (await db.warranty.findFirst({ where: { workspaceId: wid, orderId: order.id }, select: { id: true } })) return 0;
  const lines = parseJson<Line[]>(order.itemsJson, []);
  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  if (!ids.length) return 0;
  const products = await db.product.findMany({ where: { workspaceId: wid, id: { in: ids }, warrantyMonths: { gt: 0 } } });
  if (!products.length) return 0;

  let phone = normPhone(order.customerPhone);
  if (!phone && order.contactId) {
    const c = await db.record.findFirst({ where: { id: order.contactId, workspaceId: wid }, select: { dataJson: true } });
    const d = parseJson<Record<string, unknown>>(c?.dataJson, {});
    phone = normPhone(String(Object.values(d).find((v) => typeof v === "string" && /^(\+?84|0)\d{8,10}$/.test(v.replace(/[\s.]/g, ""))) ?? ""));
  }
  const start = new Date();
  const rows = [];
  for (const l of lines) {
    const p = products.find((x) => x.id === l.productId);
    if (!p) continue;
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1));
    const n = Math.min(qty, MAX_UNITS_PER_LINE);
    for (let i = 0; i < n; i++) {
      const extra = qty > n && i === n - 1 ? ` · Dòng hàng có ${qty} đơn vị, chỉ tạo ${n} phiếu` : "";
      rows.push({
        workspaceId: wid,
        recordId: order.contactId,
        productId: p.id,
        orderId: order.id,
        productName: p.name,
        customerName: order.customerName,
        phone,
        startAt: start,
        endAt: addMonths(start, p.warrantyMonths),
        note: `Từ đơn ${order.number}${n > 1 ? ` (${i + 1}/${n})` : ""}${extra}`,
      });
    }
  }
  if (!rows.length) return 0;
  await db.warranty.createMany({ data: rows });
  if (order.contactId) await db.activity.create({ data: { recordId: order.contactId, kind: "update", body: `Kích hoạt ${rows.length} phiếu bảo hành từ đơn ${order.number}`, author: "Bảo hành" } });
  return rows.length;
}
