// Đồng bộ đơn Shopee / TikTok Shop vào Đơn hàng CRM. Chống trùng theo (salesChannel, externalId).
//
// Tạo đơn qua createOrder("system", …) của Bán hàng (đánh số, tính tiền, trừ kho khi trạng thái đã chốt, chống trùng
// salesChannel + externalId); đổi trạng thái / thu tiền sau đó gọi afterOrderStatus (kho + tích điểm/bảo hành).
import type { ChannelAccount, Order, Workspace } from "@prisma/client";
import { db } from "../db";
import { buildLines, mapShopOrder, type ShopChannel, type ShopOrder } from "./order-map";
import { afterOrderStatus, createOrder, recalcPaid } from "../sales/service";
import { ingestLead } from "../sources/ingest";
import { PLATFORM_LABEL, patchSettings, type Platform } from "./accounts";
import { shopeeFetchOrder, shopeeFetchOrders } from "./shopee";
import { tiktokFetchOrder, tiktokFetchOrders } from "./tiktok";

export * from "./order-map";

/* ───────────── Ghi đơn ───────────── */

const locks = new Map<string, Promise<unknown>>();
/** Một đơn chỉ xử lý một lúc (push và job đến cùng lúc không tạo hai đơn). */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(key)) await locks.get(key)!.catch(() => {});
  const p = fn();
  locks.set(key, p);
  try {
    return await p;
  } finally {
    locks.delete(key);
  }
}

export type UpsertResult = { status: "created" | "updated" | "unchanged"; order: Order };

/** Sàn đã thu tiền → phiếu thu "Sàn thu hộ" đúng một lần, rồi tính lại đã thu (khớp recalcPaid của Bán hàng). */
async function settlePaid(order: Order, o: ShopOrder, label: string) {
  if (!o.paid || order.paid >= order.total) return order;
  const exists = await db.payment.count({ where: { orderId: order.id, createdBy: label } });
  if (!exists) await db.payment.create({ data: { workspaceId: order.workspaceId, orderId: order.id, amount: order.total - order.paid, method: "other", note: `${label} thu hộ (đơn #${o.externalId})`, createdBy: label } });
  return recalcPaid(order.id);
}

/** Tạo hoặc cập nhật đơn CRM từ một đơn sàn. Gắn/tạo khách theo SĐT nếu sàn không che số. */
export async function upsertShopOrder(ws: Workspace, o: ShopOrder): Promise<UpsertResult | null> {
  if (!o.externalId) return null;
  const label = PLATFORM_LABEL[o.channel];
  return withLock(`${ws.id}:${o.channel}:${o.externalId}`, async () => {
    const cur = await db.order.findFirst({ where: { workspaceId: ws.id, salesChannel: o.channel, externalId: o.externalId } });
    if (cur) {
      const data = {
        ...(cur.status !== o.status ? { status: o.status } : {}),
        ...(!cur.shipAddress && o.address ? { shipAddress: o.address, shipProvince: o.province, shipDistrict: o.district, shipWard: o.ward } : {}),
        ...(!cur.customerPhone && o.phone ? { customerPhone: o.phone, shipPhone: o.phone } : {}),
      };
      let order = Object.keys(data).length ? await db.order.update({ where: { id: cur.id }, data }) : cur;
      const paidBefore = order.paid;
      order = await settlePaid(order, o, label);
      if (cur.status !== o.status || order.paid !== paidBefore) await afterOrderStatus(ws.id, order.id).catch((e) => console.error("[channels] afterOrderStatus", e instanceof Error ? e.message : e));
      return { status: Object.keys(data).length ? "updated" : "unchanged", order };
    }
    const products = await db.product.findMany({ where: { workspaceId: ws.id }, select: { id: true, code: true, sku: true, name: true, unit: true, vat: true } });
    const { lines, discount } = buildLines(o, products);
    let contactId: string | null = null;
    if (o.phone) {
      const r = await ingestLead(ws, { provider: o.channel, providerLabel: label, channel: "ecommerce", name: o.buyerName, phone: o.phone, externalId: `order:${o.externalId}`, note: `Mua trên ${label}: đơn #${o.externalId}` }, { order: o.externalId }).catch(() => null);
      contactId = r?.recordId ?? null;
    }
    // createOrder cần ít nhất một dòng: đơn sàn không có dòng hàng thì ghi một dòng tổng.
    if (!lines.length) lines.push({ code: o.externalId, name: `Đơn ${label} #${o.externalId}`, unit: "đơn", qty: 1, price: Math.max(0, Math.round(o.total)), discountPct: 0, vatPct: 0 });
    const r = await createOrder("system", {
      workspaceId: ws.id,
      customerName: o.buyerName,
      customerPhone: o.phone,
      contactId,
      items: lines,
      discount,
      note: [`Đơn ${label} #${o.externalId}`, o.note && `Người mua nhắn: ${o.note}`].filter(Boolean).join("\n"),
      status: o.status,
      salesChannel: o.channel,
      externalId: o.externalId,
      shipName: o.buyerName,
      shipPhone: o.phone,
      shipAddress: o.address,
      shipProvince: o.province,
      shipDistrict: o.district,
      shipWard: o.ward,
      createdBy: label,
    });
    let order = r.order;
    // Ngày đặt theo sàn (createOrder đặt thời điểm hiện tại).
    if (r.created && o.createdAt) order = await db.order.update({ where: { id: order.id }, data: { createdAt: o.createdAt } });
    const paidBefore = order.paid;
    order = await settlePaid(order, o, label);
    if (order.paid !== paidBefore) await afterOrderStatus(ws.id, order.id).catch((e) => console.error("[channels] afterOrderStatus", e instanceof Error ? e.message : e));
    return { status: r.created ? "created" : "unchanged", order };
  });
}


/* ───────────── Đồng bộ ───────────── */

export type SyncResult = { ok: boolean; created: number; updated: number; total: number; error?: string; simulated?: boolean };

/** Kéo đơn cập nhật từ lần đồng bộ trước (lần đầu: 7 ngày; chồng 1 giờ để không sót). */
export async function syncShop(account: ChannelAccount): Promise<SyncResult> {
  const platform = account.platform as Platform;
  if (platform !== "shopee" && platform !== "tiktok") return { ok: false, created: 0, updated: 0, total: 0, error: "Không phải tài khoản sàn" };
  const ws = await db.workspace.findUnique({ where: { id: account.workspaceId } });
  if (!ws) return { ok: false, created: 0, updated: 0, total: 0, error: "Không tìm thấy workspace" };
  const since = account.lastSyncAt ? new Date(account.lastSyncAt.getTime() - 3600e3) : new Date(Date.now() - 7 * 864e5);
  const startedAt = new Date();
  try {
    const raws = platform === "shopee" ? await shopeeFetchOrders(account, since) : await tiktokFetchOrders(account, since);
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const raw of raws) {
      const o = mapShopOrder(platform, raw);
      // Một đơn lỗi (dữ liệu xấu) không chặn các đơn khác.
      const r = await upsertShopOrder(ws, o).catch((e) => {
        errors.push(`#${o.externalId}: ${e instanceof Error ? e.message : e}`);
        return null;
      });
      if (r?.status === "created") created++;
      else if (r?.status === "updated") updated++;
    }
    await db.channelAccount.update({ where: { id: account.id }, data: { lastSyncAt: startedAt } });
    await patchSettings(account.id, { lastSyncCount: raws.length, lastError: errors.length ? `${errors.length} đơn lỗi — ${errors.slice(0, 3).join("; ")}`.slice(0, 300) : "" });
    return { ok: true, created, updated, total: raws.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await patchSettings(account.id, { lastError: error.slice(0, 300) });
    return { ok: false, created: 0, updated: 0, total: 0, error };
  }
}

/** Push của sàn báo đơn đổi trạng thái: tải chi tiết đơn đó rồi ghi. */
export async function syncOneOrder(account: ChannelAccount, orderId: string) {
  const platform = account.platform as ShopChannel;
  const ws = await db.workspace.findUnique({ where: { id: account.workspaceId } });
  if (!ws) return null;
  const raw = platform === "shopee" ? await shopeeFetchOrder(account, orderId) : await tiktokFetchOrder(account, orderId);
  return raw ? upsertShopOrder(ws, mapShopOrder(platform, raw)) : null;
}

/** Job 10 phút: đồng bộ mọi shop đang bật. Lỗi một shop không chặn shop khác. */
export async function tickShopOrders() {
  const accounts = await db.channelAccount.findMany({ where: { active: true, platform: { in: ["shopee", "tiktok"] } } });
  const out: { id: string; result: SyncResult }[] = [];
  for (const a of accounts) {
    // Chưa uỷ quyền xong (đang chờ OAuth): bỏ qua.
    if (a.accountId.startsWith("pending_")) continue;
    out.push({ id: a.id, result: await syncShop(a) });
  }
  return out;
}
