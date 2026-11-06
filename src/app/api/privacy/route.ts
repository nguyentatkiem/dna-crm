import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess, getRole } from "@/lib/permissions";
import { setPref } from "@/lib/prefs";
import { audit, diffOf } from "@/lib/audit";
import { checkExportQuota, getPrivacy, type Privacy } from "@/lib/privacy";

/** Cấu hình bảo mật hiện tại + hạn mức xuất còn lại hôm nay của người đang xem. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  const [prefs, quota] = await Promise.all([getPrivacy(a.ctx.workspace.id), checkExportQuota(a.ctx, 0, role)]);
  return ok({ ...prefs, role, exportRemainingToday: isFinite(quota.remaining) ? quota.remaining : null });
}

const Body = z.object({
  maskPhone: z.boolean().optional(),
  maskEmail: z.boolean().optional(),
  exportDailyLimit: z.number().int().min(0).max(1_000_000).optional(),
  alertExportRows: z.number().int().min(0).max(1_000_000).optional(),
});

/** Chỉ chủ workspace sửa được. Ghi nhật ký thay đổi. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  if (!allow(await getAccess(ctx.user.id, ctx.workspace.id), "settings_manage")) return fail("Bạn chưa có quyền đổi cài đặt bảo mật", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const before = await getPrivacy(ctx.workspace.id);
  const next: Privacy = { ...before, ...Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined)) };
  await setPref(ctx.workspace.id, "privacy", next);
  const diff = diffOf(before, next);
  if (Object.keys(diff).length) await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "settings.privacy", "settings", "privacy", `Đổi cài đặt bảo mật dữ liệu: ${Object.keys(diff).join(", ")}`, diff);
  return ok(next);
}
