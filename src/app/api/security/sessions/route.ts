import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { revokeAllSessions, revokeSession } from "@/lib/security/sessions";

/** Đăng xuất phiên của chính mình: { id } một phiên, hoặc { others: true } mọi phiên trừ phiên đang dùng. */
export async function DELETE(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { user, workspace, sessionId } = a.ctx;
  const b = (await req.json().catch(() => ({}))) as { id?: string; others?: boolean };
  const who = { workspaceId: workspace.id, user };
  if (b.others) {
    const n = await revokeAllSessions(user.id, sessionId || undefined);
    await audit(who, "auth.logout_others", "user", user.id, `${user.name} đăng xuất ${n} phiên ở thiết bị khác`);
    return ok({ revoked: n });
  }
  if (!b.id) return fail("Thiếu phiên cần đăng xuất");
  const r = await revokeSession(b.id, user.id);
  if (!r.count) return fail("Không tìm thấy phiên", 404);
  await audit(who, "auth.logout_session", "user", user.id, `${user.name} đăng xuất một phiên${b.id === sessionId ? " (phiên hiện tại)" : ""}`);
  return ok({ revoked: 1, current: b.id === sessionId });
}
