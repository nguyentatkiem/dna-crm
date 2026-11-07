import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/security/sessions";

/** Đổi mật khẩu của chính mình (cần mật khẩu hiện tại). Đăng xuất mọi phiên khác. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { user, workspace, sessionId } = a.ctx;
  const b = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  const next = String(b.next ?? "");
  if (!(await bcrypt.compare(String(b.current ?? ""), user.passwordHash))) return fail("Mật khẩu hiện tại chưa đúng");
  if (next.length < 8) return fail("Mật khẩu mới cần ít nhất 8 ký tự");
  if (next === b.current) return fail("Mật khẩu mới phải khác mật khẩu cũ");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), failedLogins: 0, lockedUntil: null } });
  const n = await revokeAllSessions(user.id, sessionId || undefined);
  await audit({ workspaceId: workspace.id, user }, "auth.password", "user", user.id, `${user.name} đổi mật khẩu${n ? `, đăng xuất ${n} phiên khác` : ""}`);
  return ok({ updated: true, revoked: n });
}
