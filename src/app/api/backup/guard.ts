import { appApi, fail } from "@/lib/http";
import { can, getRole } from "@/lib/permissions";

/** Chỉ chủ workspace được sao lưu / khôi phục. */
export async function ownerApi() {
  const a = await appApi();
  if ("error" in a) return a;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "manage_settings")) return { error: fail("Chỉ chủ workspace được sao lưu và khôi phục dữ liệu", 403) } as const;
  return a;
}
