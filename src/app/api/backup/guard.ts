import { appApi, fail } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";

/** Chỉ chủ workspace được sao lưu / khôi phục. */
export async function ownerApi() {
  const a = await appApi();
  if ("error" in a) return a;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "backup_manage")) return { error: fail("Chỉ chủ workspace được sao lưu và khôi phục dữ liệu", 403) } as const;
  return a;
}
