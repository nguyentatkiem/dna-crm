import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { can, getRole } from "@/lib/permissions";
import { COMPANY_DEFAULT, getPref, setPref, type Company } from "@/lib/prefs";
import { CompanyInput, firstError } from "@/lib/sales/schemas";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await getPref<Company>(a.ctx.workspace.id, "company", COMPANY_DEFAULT));
}

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "see_all")) return fail("Chỉ chủ và quản lý được sửa thông tin doanh nghiệp", 403);
  const p = CompanyInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const before = await getPref<Company>(a.ctx.workspace.id, "company", COMPANY_DEFAULT);
  const value = await setPref<Company>(a.ctx.workspace.id, "company", { ...COMPANY_DEFAULT, ...p.data });
  const diff = diffOf(before, value);
  if (Object.keys(diff).length) await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "company.update", "company", a.ctx.workspace.id, `Sửa thông tin doanh nghiệp: ${Object.keys(diff).join(", ")}`, diff);
  return ok(value);
}
