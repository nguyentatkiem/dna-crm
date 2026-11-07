import { db, parseJson } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { accessOf } from "@/lib/permissions";
import { deviceOf } from "@/lib/security/device";
import { securityPref } from "@/lib/security/sessions";

/** Trạng thái bảo mật của người đang đăng nhập: 2 lớp, phiên đăng nhập, chính sách workspace. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { user, workspace, sessionId } = a.ctx;
  const [sessions, pref, acc] = await Promise.all([
    db.userSession.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { lastSeenAt: "desc" }, take: 50 }),
    securityPref(workspace.id),
    accessOf(a.ctx),
  ]);
  return ok({
    totpEnabled: user.totpEnabled,
    recoveryLeft: parseJson<string[]>(user.recoveryJson, []).length,
    isOwner: acc.isOwner,
    policy: pref.require2faFor,
    legacySession: !sessionId,
    sessions: sessions.map((s) => ({ id: s.id, device: deviceOf(s.userAgent), ip: s.ip, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === sessionId })),
  });
}
