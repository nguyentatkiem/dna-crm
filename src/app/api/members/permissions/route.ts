import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow, memberSeesOwnOnly } from "@/lib/permissions";
import { saveSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { loadRoles, saveRoles } from "@/app/api/roles/shared";

/**
 * Bật/tắt nhanh "Nhân viên chỉ thấy khách của mình" (= phạm vi dữ liệu của vai trò Nhân viên: Chỉ của mình / Toàn bộ).
 * Body: { memberSeesOwnOnly: boolean }. Chỉ chủ. Phạm vi "Của cả đội" và vai trò khác: trang Vai trò & quyền.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!allow(await accessOf(a.ctx), "roles_manage")) return fail("Chỉ chủ workspace được đổi phân quyền", 403);
  const body = (await req.json().catch(() => ({}))) as { memberSeesOwnOnly?: boolean };
  if (typeof body.memberSeesOwnOnly !== "boolean") return fail("Dữ liệu chưa hợp lệ");
  const { pref, defs } = await loadRoles(wid, a.ctx.workspace.settingsJson);
  const before = defs.find((d) => d.key === "member")?.scope === "own";
  const scope = body.memberSeesOwnOnly ? "own" : "all";
  pref.overrides.member = { ...(pref.overrides.member ?? {}), scope };
  await saveRoles(wid, pref);
  // Giữ cài đặt cũ đồng bộ cho bản cài chưa cập nhật.
  await saveSettings(wid, { permissions: { memberSeesOwnOnly: body.memberSeesOwnOnly ? "1" : "0" } });
  if (before !== body.memberSeesOwnOnly) {
    const txt = (v: boolean) => (v ? "Bật" : "Tắt");
    await audit({ workspaceId: wid, user: a.ctx.user }, "settings.permissions", "settings", "permissions", `${txt(body.memberSeesOwnOnly)} “Nhân viên chỉ thấy khách của mình”`, { memberSeesOwnOnly: [txt(before), txt(body.memberSeesOwnOnly)] });
  }
  return ok({ memberSeesOwnOnly: body.memberSeesOwnOnly });
}
