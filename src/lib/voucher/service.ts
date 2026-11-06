// Nghiệp vụ voucher phía máy chủ: phát mã, kiểm tra, áp vào đơn, nhắc hết hạn.
import type { Order, Voucher, VoucherCampaign } from "@prisma/client";
import { db } from "../db";
import { getPref } from "../prefs";
import { notifyOnce, userIdByName } from "../notify";
import { sendMessage, type Channel } from "../marketing/messaging";
import { loadCfg } from "../marketing/store";
import { resolveSegment } from "../care/segments";
import { VOUCHER_PREF_DEFAULT, checkVoucher, fillVoucherTemplate, generateCode, normCode, valueText, type VoucherPref } from "./shared";

// HỢP ĐỒNG (đợt B hiện thực). Tự động hoá và đơn hàng gọi các hàm này.
export type IssueInput = { campaignId: string; recordId: string; reason?: string; by?: string; send?: "zalo" | "zns" | "sms" | "email" | "" };
export type IssuedVoucher = { id: string; code: string; expiresAt: Date; /** Có chọn kênh gửi mà gửi không được (chưa cấu hình kênh, khách thiếu SĐT…). Mã vẫn được phát. */ sendError?: string };

const D = 864e5;
export const voucherPref = (wid: string) => getPref<VoucherPref>(wid, "voucher", VOUCHER_PREF_DEFAULT);
const fmtDate = (d: Date) => d.toLocaleDateString("vi-VN", { timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" });

/** Mã chưa ai dùng trong workspace (thử vài lần với DB). */
async function freshCode(workspaceId: string, prefix: string) {
  for (let i = 0; i < 8; i++) {
    const code = generateCode(prefix, Math.random, i < 5 ? 6 : 8);
    if (!(await db.voucher.findUnique({ where: { workspaceId_code: { workspaceId, code } }, select: { id: true } }))) return code;
  }
  return generateCode(prefix, Math.random, 10);
}

/** Phát một voucher của chiến dịch cho khách. Trả null nếu chiến dịch tắt hoặc khách đã nhận đủ số lượt. */
export async function issueVoucher(workspaceId: string, input: IssueInput): Promise<IssuedVoucher | null> {
  const c = await db.voucherCampaign.findFirst({ where: { id: input.campaignId, workspaceId } });
  if (!c || !c.active) return null;
  const rec = await db.record.findFirst({ where: { id: input.recordId, workspaceId }, select: { id: true, title: true } });
  if (!rec) return null;
  const had = await db.voucher.count({ where: { workspaceId, campaignId: c.id, recordId: rec.id, status: { not: "void" } } });
  if (had >= c.perCustomer) return null;
  const expiresAt = new Date(Date.now() + c.validDays * D);
  let v: Voucher | null = null;
  for (let i = 0; i < 3 && !v; i++) {
    try {
      v = await db.voucher.create({ data: { workspaceId, campaignId: c.id, code: await freshCode(workspaceId, c.prefix), recordId: rec.id, reason: (input.reason ?? "Thủ công").slice(0, 120), expiresAt } });
    } catch {
      // Trùng mã do hai lượt cùng lúc: thử lại.
    }
  }
  if (!v) return null;
  await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Tặng voucher ${v.code} (${c.name}: ${valueText(c)}), hạn đến ${fmtDate(expiresAt)}`, author: input.by || "Voucher" } });
  if (input.send) {
    const tpl = (await voucherPref(workspaceId)).template || VOUCHER_PREF_DEFAULT.template;
    const body = fillVoucherTemplate(tpl, { code: v.code, value: valueText(c), expiresAt, name: rec.title });
    const r = await sendMessage(workspaceId, { channel: input.send as Channel, recordId: rec.id, subject: `Quà tặng: ${c.name}`, body, params: { code: v.code, value: valueText(c), expiresAt: fmtDate(expiresAt) } });
    if (r.ok) await db.voucher.update({ where: { id: v.id }, data: { sentVia: input.send } });
    else return { id: v.id, code: v.code, expiresAt, sendError: r.error || "Gửi tin không thành công" };
  }
  return { id: v.id, code: v.code, expiresAt };
}

/** Phát cho cả nhóm khách. Khách đã nhận đủ lượt thì bỏ qua. */
export async function issueToSegment(workspaceId: string, input: Omit<IssueInput, "recordId"> & { segmentId: string }) {
  const rows = (await resolveSegment(workspaceId, input.segmentId)).filter((r) => r.objectKey === "contacts").slice(0, 2000);
  let issued = 0, sendFailed = 0;
  let sendError = "";
  for (const r of rows) {
    const v = await issueVoucher(workspaceId, { ...input, recordId: r.id });
    if (!v) continue;
    issued++;
    if (v.sendError) {
      sendFailed++;
      sendError ||= v.sendError;
    }
  }
  return { total: rows.length, issued, skipped: rows.length - issued, sendFailed, sendError };
}

export async function findVoucher(workspaceId: string, code: string) {
  const c = normCode(code);
  if (!c) return null;
  return db.voucher.findUnique({ where: { workspaceId_code: { workspaceId, code: c } }, include: { campaign: true } });
}

/** Kiểm tra mã cho đơn: trả voucher + số tiền giảm, hoặc lỗi. */
export async function validateCode(workspaceId: string, code: string, subtotal: number, contactId?: string | null, orderId?: string | null) {
  const v = await findVoucher(workspaceId, code);
  const r = checkVoucher({ voucher: v, campaign: v?.campaign ?? null, subtotal, contactId, orderId });
  if ("error" in r) return { ok: false, error: r.error } as const;
  return { ok: true, voucher: v!, campaign: v!.campaign, discount: r.discount, label: valueText(v!.campaign) } as const;
}

/** Trả voucher đang gắn với đơn về trạng thái chưa dùng (đơn huỷ, xoá, đổi mã). */
export async function releaseOrderVoucher(workspaceId: string, orderId: string, exceptCode = "") {
  const vs = await db.voucher.findMany({ where: { workspaceId, usedOrderId: orderId, status: "used", ...(exceptCode ? { code: { not: exceptCode } } : {}) } });
  for (const v of vs) {
    await db.voucher.update({ where: { id: v.id }, data: { status: v.expiresAt < new Date() ? "expired" : "issued", usedAt: null, usedOrderId: null, discount: 0 } });
    if (v.recordId) await db.activity.create({ data: { recordId: v.recordId, kind: "update", body: `Hoàn voucher ${v.code} (đơn không còn dùng mã)`, author: "Voucher" } });
  }
  return vs.length;
}

/**
 * Đánh dấu voucher đã dùng cho đơn (nguyên tử: chỉ khi còn "issued" hoặc đã gắn chính đơn này).
 * Lần đầu dùng: ghi hoạt động trên khách và chạy tự động hoá voucher_used.
 */
export async function markVoucherUsed(workspaceId: string, code: string, order: Pick<Order, "id" | "number" | "contactId">, discount: number, by = "") {
  const v = await findVoucher(workspaceId, code);
  if (!v) return false;
  const already = v.status === "used" && v.usedOrderId === order.id;
  const claim = await db.voucher.updateMany({ where: { id: v.id, OR: [{ status: "issued" }, { status: "used", usedOrderId: order.id }] }, data: { status: "used", usedAt: already ? v.usedAt : new Date(), usedOrderId: order.id, discount } });
  if (!claim.count || already) return claim.count > 0;
  const recordId = v.recordId ?? order.contactId;
  const rec = recordId ? await db.record.findFirst({ where: { id: recordId, workspaceId } }) : null;
  if (rec) {
    await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Dùng voucher ${v.code} cho đơn ${order.number}, giảm ${Math.round(discount).toLocaleString("vi-VN")}đ`, author: by || "Voucher" } });
    const cfg = await loadCfg(workspaceId);
    if (cfg) await import("../automation").then((m) => m.fireEvent(workspaceId, cfg, { kind: "voucher_used", record: rec, value: v.campaignId })).catch((e) => console.error("[voucher] fireEvent", e instanceof Error ? e.message : e));
  }
  return true;
}

/**
 * Tính phần giảm từ voucher cho một đơn đang tạo/sửa. code rỗng = không dùng mã.
 * base = tạm tính sau chiết khấu tay (để mã % không tính trên phần đã giảm).
 */
export async function orderVoucher(workspaceId: string, code: unknown, base: number, contactId: string | null, orderId?: string) {
  const c = normCode(typeof code === "string" ? code : "");
  if (!c) return { code: "", discount: 0 } as const;
  const r = await validateCode(workspaceId, c, base, contactId, orderId);
  if (!r.ok) return { error: `${r.error} (mã ${c})` } as const;
  return { code: c, discount: r.discount } as const;
}

/** Job hằng ngày: chuyển mã quá hạn sang "Hết hạn" và nhắc người phụ trách mã sắp hết hạn trong 3 ngày. */
export async function tickVouchers(now = new Date()): Promise<{ expired: number; reminded: number }> {
  const expired = await db.voucher.updateMany({ where: { status: "issued", expiresAt: { lt: now } }, data: { status: "expired" } });
  // Cửa sổ (2, 3] ngày: chạy mỗi ngày thì mỗi mã chỉ rơi vào đúng một lần; notifyOnce chặn trùng nếu chạy dày hơn.
  const soon = await db.voucher.findMany({ where: { status: "issued", recordId: { not: null }, expiresAt: { gt: new Date(now.getTime() + 2 * D), lte: new Date(now.getTime() + 3 * D) } }, include: { campaign: true }, take: 1000 });
  let reminded = 0;
  for (const v of soon) {
    const rec = await db.record.findFirst({ where: { id: v.recordId!, workspaceId: v.workspaceId }, select: { id: true, title: true, ownerName: true, objectKey: true } });
    if (!rec) continue;
    const userId = await userIdByName(v.workspaceId, rec.ownerName);
    const sent = await notifyOnce(v.workspaceId, { userId, kind: "voucher", text: `Voucher ${v.code} (${v.campaign.name}) của ${rec.title} sắp hết hạn ngày ${fmtDate(v.expiresAt)}. Nhắc khách dùng nhé!`, href: `/w/b/${rec.objectKey}?open=${rec.id}` });
    if (sent) reminded++;
  }
  return { expired: expired.count, reminded };
}

export type CampaignWithStats = VoucherCampaign & { issued: number; used: number; discountTotal: number };

/** Chiến dịch kèm số mã đã phát, đã dùng, tổng tiền giảm. */
export async function campaignsWithStats(workspaceId: string): Promise<CampaignWithStats[]> {
  const [cs, g] = await Promise.all([
    db.voucherCampaign.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    db.voucher.groupBy({ by: ["campaignId", "status"], where: { workspaceId }, _count: { _all: true }, _sum: { discount: true } }),
  ]);
  return cs.map((c) => {
    const rows = g.filter((x) => x.campaignId === c.id);
    return { ...c, issued: rows.reduce((s, x) => s + x._count._all, 0), used: rows.filter((x) => x.status === "used").reduce((s, x) => s + x._count._all, 0), discountTotal: rows.reduce((s, x) => s + (x._sum.discount ?? 0), 0) };
  });
}
