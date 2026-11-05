import { appApi, fail, ok } from "@/lib/http";
import { can, getRole, memberSeesOwnOnly } from "@/lib/permissions";
import { saveSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

/** Bật/tắt "Nhân viên chỉ thấy khách của mình". Body: { memberSeesOwnOnly: boolean }. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!can(await getRole(a.ctx.user.id, wid), "manage_settings")) return fail("Chỉ chủ workspace được đổi phân quyền", 403);
  const body = (await req.json().catch(() => ({}))) as { memberSeesOwnOnly?: boolean };
  if (typeof body.memberSeesOwnOnly !== "boolean") return fail("Dữ liệu chưa hợp lệ");
  const before = memberSeesOwnOnly(a.ctx.workspace);
  await saveSettings(wid, { permissions: { memberSeesOwnOnly: body.memberSeesOwnOnly ? "1" : "0" } });
  if (before !== body.memberSeesOwnOnly) {
    const txt = (v: boolean) => (v ? "Bật" : "Tắt");
    await audit({ workspaceId: wid, user: a.ctx.user }, "settings.permissions", "settings", "permissions", `${txt(body.memberSeesOwnOnly)} “Nhân viên chỉ thấy khách của mình”`, { memberSeesOwnOnly: [txt(before), txt(body.memberSeesOwnOnly)] });
  }
  return ok({ memberSeesOwnOnly: body.memberSeesOwnOnly });
}
