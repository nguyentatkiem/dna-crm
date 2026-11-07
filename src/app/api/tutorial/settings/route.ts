import { appApi, fail, ok } from "@/lib/http";
import { accessOf } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { setPref } from "@/lib/prefs";
import { SETTINGS_KEY } from "@/lib/tutorial/progress";
import { SettingsPatchSchema } from "@/lib/tutorial/schema";
import { loadSettings } from "@/lib/tutorial/server";

/** Cài đặt hướng dẫn của workspace (mọi người đọc được). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await loadSettings(a.ctx.workspace.id));
}

/** Chỉ chủ sửa: chào thành viên mới, hiện danh sách bắt đầu. */
export async function PATCH(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await accessOf(a.ctx)).isOwner) return fail("Chỉ chủ workspace sửa được cài đặt hướng dẫn", 403);
  const p = SettingsPatchSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const before = await loadSettings(a.ctx.workspace.id);
  const next = { ...before, ...p.data };
  await setPref(a.ctx.workspace.id, SETTINGS_KEY, next);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "pref.update", "pref", SETTINGS_KEY, "Sửa cài đặt hướng dẫn cho người mới", { before, after: next });
  return ok(next);
}
