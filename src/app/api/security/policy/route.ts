import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { accessOf } from "@/lib/permissions";
import { setPref } from "@/lib/prefs";
import { securityPref, type SecurityPref } from "@/lib/security/sessions";

const LABEL: Record<SecurityPref["require2faFor"], string> = { none: "không bắt buộc", owners: "bắt buộc với Chủ", managers: "bắt buộc với Chủ và Quản lý" };

/** Chủ workspace: bắt buộc bật xác thực 2 lớp theo vai trò. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await accessOf(a.ctx)).isOwner) return fail("Chỉ chủ workspace được đổi chính sách bảo mật", 403);
  const b = (await req.json().catch(() => ({}))) as { require2faFor?: string };
  const v = b.require2faFor;
  if (v !== "none" && v !== "owners" && v !== "managers") return fail("Giá trị không hợp lệ");
  if (v !== "none" && !a.ctx.user.totpEnabled) return fail("Hãy tự bật xác thực 2 lớp cho tài khoản của bạn trước khi bắt buộc người khác.");
  const before = await securityPref(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "security", { ...before, require2faFor: v });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "security.policy", "workspace", a.ctx.workspace.id, `Xác thực 2 lớp: ${LABEL[v]}`, { require2faFor: [before.require2faFor, v] });
  return ok({ require2faFor: v });
}
