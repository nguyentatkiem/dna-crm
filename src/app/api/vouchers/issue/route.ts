import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { findScopedRecord } from "@/lib/permissions";
import { SEND_CHANNELS } from "@/lib/voucher/shared";
import { canManageVouchers } from "@/lib/voucher/api";
import { issueToSegment, issueVoucher } from "@/lib/voucher/service";

const Body = z.object({ campaignId: z.string().min(1).max(60), recordId: z.string().max(60).optional(), segmentId: z.string().max(60).optional(), send: z.enum(SEND_CHANNELS).catch(""), reason: z.string().max(120).optional() });

/** Phát voucher cho một khách (mọi nhân viên) hoặc cả nhóm khách (chủ/quản lý). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Chọn chương trình voucher");
  const d = p.data;
  const c = await db.voucherCampaign.findFirst({ where: { id: d.campaignId, workspaceId: wid } });
  if (!c) return fail("Không tìm thấy chương trình", 404);
  if (!c.active) return fail("Chương trình đang tắt", 409);
  if (d.segmentId) {
    if (!(await canManageVouchers(a.ctx))) return fail("Chỉ chủ hoặc quản lý phát được cho cả nhóm", 403);
    if (!(await db.segment.findFirst({ where: { id: d.segmentId, workspaceId: wid }, select: { id: true } }))) return fail("Không tìm thấy nhóm khách", 404);
    const r = await issueToSegment(wid, { campaignId: c.id, segmentId: d.segmentId, send: d.send, reason: d.reason || "Phát theo nhóm", by: a.ctx.user.name });
    await audit({ workspaceId: wid, user: a.ctx.user }, "voucher.issue", "voucherCampaign", c.id, `Phát ${r.issued} voucher “${c.name}” cho nhóm khách`);
    return ok(r);
  }
  if (!d.recordId) return fail("Chọn khách hoặc nhóm khách");
  const rec = await findScopedRecord(a.ctx, d.recordId);
  if (!rec) return fail("Không tìm thấy khách", 404);
  const v = await issueVoucher(wid, { campaignId: c.id, recordId: rec.id, send: d.send, reason: d.reason || "Thủ công", by: a.ctx.user.name });
  if (!v) return fail(`${rec.title} đã nhận đủ ${c.perCustomer} mã của chương trình này`, 409);
  await audit({ workspaceId: wid, user: a.ctx.user }, "voucher.issue", "voucher", v.id, `Phát voucher ${v.code} cho ${rec.title}`);
  return ok(v, 201);
}
