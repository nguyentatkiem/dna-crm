import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { setPref } from "@/lib/prefs";
import { canManageVouchers } from "@/lib/voucher/api";
import { voucherPref } from "@/lib/voucher/service";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await voucherPref(a.ctx.workspace.id));
}

const Body = z.object({ template: z.string().trim().min(1, "Mẫu tin không được trống").max(1000) });

/** Mẫu tin gửi kèm voucher: {code} {value} {expiresAt} {name}. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageVouchers(a.ctx))) return fail("Bạn chưa có quyền quản lý voucher", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (!p.data.template.includes("{code}")) return fail("Mẫu tin cần có {code}");
  await setPref(a.ctx.workspace.id, "voucher", p.data);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "voucher.settings", "voucher", "", "Sửa mẫu tin voucher");
  return ok(p.data);
}
