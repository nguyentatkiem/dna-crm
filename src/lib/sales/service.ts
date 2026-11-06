// Nghiệp vụ bán hàng dùng chung cho API, trang công khai và dữ liệu mẫu.
import type { Order, Quote } from "@prisma/client";
import { postWin } from "@/lib/feed";
import { vnd } from "@/lib/format";
import { db, parseJson } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { notify, userIdByName } from "@/lib/notify";
import { wonLost } from "@/lib/metrics";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { runAutomations } from "@/lib/records";
import { fireRecordUpdate } from "@/lib/automation";
import { awardPointsForOrder, createWarrantiesForOrder } from "@/lib/care/hooks";

type Actor = { id: string; name: string } | null;

export async function activeConfig(workspaceId: string) {
  const row = await db.workspaceConfig.findFirst({ where: { workspaceId, isActive: true } });
  return parseJson<WorkspaceConfig | null>(row?.configJson, null);
}

/** Đơn hàng từ báo giá. Đã có đơn thì trả đơn cũ (bấm hai lần không tạo hai đơn). */
export async function orderFromQuote(q: Quote, actor: Actor): Promise<Order> {
  if (q.orderId) {
    const existing = await db.order.findFirst({ where: { id: q.orderId, workspaceId: q.workspaceId } });
    if (existing) return existing;
  }
  const number = await nextNumber(q.workspaceId, "DH");
  const order = await db.order.create({
    data: {
      workspaceId: q.workspaceId,
      number,
      recordId: q.recordId,
      contactId: q.contactId,
      quoteId: q.id,
      customerName: q.customerName,
      customerPhone: q.customerPhone,
      itemsJson: q.itemsJson,
      discount: q.discount,
      subtotal: q.subtotal,
      vatTotal: q.vatTotal,
      total: q.total,
      note: q.note,
      createdBy: actor?.name ?? q.createdBy,
    },
  });
  // Giữ chỗ nguyên tử: hai yêu cầu cùng lúc thì yêu cầu đến sau xoá đơn thừa của mình.
  const claim = await db.quote.updateMany({ where: { id: q.id, orderId: null }, data: { orderId: order.id } });
  if (!claim.count) {
    await db.order.delete({ where: { id: order.id } });
    const fresh = await db.quote.findUnique({ where: { id: q.id } });
    const other = fresh?.orderId ? await db.order.findUnique({ where: { id: fresh.orderId } }) : null;
    if (other) return other;
  }
  await audit({ workspaceId: q.workspaceId, user: actor }, "order.create", "order", order.id, `Tạo đơn ${number} từ báo giá ${q.number} (${q.customerName})`);
  return order;
}

/** Chuyển giao dịch sang trạng thái "thắng" đầu tiên của bảng, đi qua tự động hoá như khi sửa tay. */
export async function winDeal(workspaceId: string, recordId: string, actor: Actor, reason: string) {
  const cfg = await activeConfig(workspaceId);
  const rec = await db.record.findFirst({ where: { id: recordId, workspaceId } });
  if (!cfg || !rec || rec.objectKey !== "deals") return false;
  const obj = getObject(cfg, "deals");
  const { won } = wonLost(cfg);
  const target = obj?.statuses.find((s) => won.has(s.key))?.key;
  if (!target || won.has(rec.status)) return false;
  const updated = await db.record.update({ where: { id: rec.id }, data: { status: target } });
  const from = obj?.statuses.find((s) => s.key === rec.status)?.label ?? rec.status;
  const to = obj?.statuses.find((s) => s.key === target)?.label ?? target;
  const who = actor?.name ?? "Hệ thống";
  await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `${reason}: đổi ${obj?.statusLabel.toLowerCase() ?? "trạng thái"} từ “${from}” sang “${to}”`, author: who } });
  await runAutomations(workspaceId, cfg, { kind: "status_changed", record: updated, from: rec.status });
  await fireRecordUpdate(workspaceId, cfg, rec, updated).catch((e) => console.error("[automation]", e instanceof Error ? e.message : e));
  await audit({ workspaceId, user: actor }, "record.update", rec.objectKey, rec.id, `Sửa “${rec.title}”: trạng thái (${reason})`, { status: [rec.status, target] });
  await postWin(workspaceId, `🎉 ${rec.ownerName || who} vừa chốt “${rec.title}”${rec.amount ? ` – ${vnd(rec.amount)}` : ""} (${reason.toLowerCase()})`, who).catch(() => undefined);
  return true;
}

/**
 * Khách (hoặc nhân viên thay khách) chấp nhận báo giá: ghi nhận, báo người tạo,
 * chuyển giao dịch sang thắng và tự tạo đơn hàng.
 */
export async function acceptQuote(q: Quote, name: string, actor: Actor) {
  const now = new Date();
  const claim = await db.quote.updateMany({ where: { id: q.id, status: { notIn: ["accepted"] } }, data: { status: "accepted", acceptedAt: now, acceptedName: name.slice(0, 120), rejectReason: "" } });
  if (!claim.count) return { already: true, orderId: q.orderId };
  const fresh = { ...q, status: "accepted", acceptedAt: now, acceptedName: name };
  const by = actor ? `${actor.name} ghi nhận` : "Khách";
  await audit({ workspaceId: q.workspaceId, user: actor }, "quote.accept", "quote", q.id, `${by}: ${name || q.customerName} chấp nhận báo giá ${q.number}`);
  const uid = await userIdByName(q.workspaceId, q.createdBy);
  if (!actor || actor.id !== uid) await notify(q.workspaceId, { userId: uid, kind: "quote", text: `${name || q.customerName} đã chấp nhận báo giá ${q.number}`, href: `/w/quotes/${q.id}` });
  if (q.recordId) await winDeal(q.workspaceId, q.recordId, actor, `Khách chấp nhận báo giá ${q.number}`).catch((e) => console.error("[sales] winDeal", e));
  const order = await orderFromQuote(fresh, actor);
  return { already: false, orderId: order.id };
}

/** Cộng lại tiền đã thu từ các phiếu thu. */
export async function recalcPaid(orderId: string) {
  const s = await db.payment.aggregate({ where: { orderId }, _sum: { amount: true } });
  return db.order.update({ where: { id: orderId }, data: { paid: Math.round(s._sum.amount ?? 0) } });
}

/**
 * Đơn hoàn tất và đã thu đủ → tích điểm + tạo bảo hành, đúng một lần.
 * Giữ chỗ bằng pointsAwarded: 0 = chưa xử lý; sau khi xử lý lưu số điểm, hoặc -1 nếu không cộng điểm nào.
 */
export async function completeIfReady(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || o.status !== "done" || o.paid < o.total || o.pointsAwarded !== 0) return false;
  const claim = await db.order.updateMany({ where: { id: o.id, pointsAwarded: 0 }, data: { pointsAwarded: -1 } });
  if (!claim.count) return false;
  const input = { id: o.id, number: o.number, workspaceId: o.workspaceId, contactId: o.contactId, customerName: o.customerName, customerPhone: o.customerPhone, total: o.total, itemsJson: o.itemsJson, createdBy: o.createdBy };
  try {
    const points = await awardPointsForOrder(input);
    await createWarrantiesForOrder(input);
    if (points > 0) await db.order.update({ where: { id: o.id }, data: { pointsAwarded: points } });
    await postWin(o.workspaceId, `🎉 Đơn ${o.number}${o.customerName ? ` của ${o.customerName}` : ""} đã hoàn tất và thu đủ ${vnd(o.total)}`, o.createdBy || "Hệ thống").catch(() => undefined);
    return true;
  } catch (e) {
    // Lỗi thì nhả chỗ để lần sau thử lại.
    await db.order.update({ where: { id: o.id }, data: { pointsAwarded: 0 } });
    console.error("[sales] completeIfReady", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Gốc URL công khai lấy từ request (dev, proxy, tên miền riêng đều đúng). */
export function originOf(h: Headers, fallback = "") {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return fallback;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
