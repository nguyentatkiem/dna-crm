import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { CampaignInput } from "@/lib/voucher/shared";
import { canManageVouchers } from "@/lib/voucher/api";

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageVouchers(a.ctx))) return fail("Bạn chưa có quyền quản lý voucher", 403);
  const p = CampaignInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const d = p.data;
  const c = await db.voucherCampaign.create({ data: { workspaceId: a.ctx.workspace.id, ...d, prefix: d.prefix || "DNA", active: d.active ?? true, createdBy: a.ctx.user.name } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "voucher.campaign.create", "voucherCampaign", c.id, `Tạo chương trình voucher “${c.name}”`);
  return ok(c, 201);
}
