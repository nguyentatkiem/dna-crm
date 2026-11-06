import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { CampaignInput } from "@/lib/voucher/shared";
import { canManageVouchers } from "@/lib/voucher/api";

type P = { params: Promise<{ id: string }> };

/** Sửa chương trình, hoặc chỉ bật/tắt ({ active }). Mã đã phát giữ nguyên hạn dùng. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageVouchers(a.ctx))) return fail("Bạn chưa có quyền quản lý voucher", 403);
  const c = await db.voucherCampaign.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!c) return fail("Không tìm thấy chương trình", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let data: Record<string, unknown>;
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") data = { active: body.active };
  else {
    const p = CampaignInput.safeParse(body);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
    data = { ...p.data, prefix: p.data.prefix || c.prefix };
  }
  const u = await db.voucherCampaign.update({ where: { id: c.id }, data });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "voucher.campaign.update", "voucherCampaign", c.id, `Sửa chương trình voucher “${u.name}”`, diffOf(c as unknown as Record<string, unknown>, data));
  return ok(u);
}

/** Xoá chương trình: chỉ khi chưa có mã nào được dùng (tránh mất dấu giảm giá trên đơn). */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageVouchers(a.ctx))) return fail("Bạn chưa có quyền quản lý voucher", 403);
  const c = await db.voucherCampaign.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!c) return fail("Không tìm thấy chương trình", 404);
  if (await db.voucher.count({ where: { campaignId: c.id, status: "used" } })) return fail("Chương trình đã có mã được dùng. Hãy tắt chương trình thay vì xoá.", 409);
  await db.voucherCampaign.delete({ where: { id: c.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "voucher.campaign.delete", "voucherCampaign", c.id, `Xoá chương trình voucher “${c.name}”`);
  return ok({ deleted: true });
}
