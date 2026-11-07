import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, parseJson } from "./db";
import { WorkspaceConfig } from "./config/schema";

export const SESSION_COOKIE = "crm_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu SESSION_SECRET (ít nhất 32 ký tự) trong .env. Chạy: npm run setup");
  return new TextEncoder().encode(s);
};

/** sid = UserSession.id (phiên đăng nhập trong DB, thu hồi được). iat = lúc ký (giây). */
export type Session = { uid: string; wid: string; sid?: string; iat?: number };

export async function signSession(s: { uid: string; wid: string; sid: string }) {
  return new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), wid: String(payload.wid), sid: payload.sid ? String(payload.sid) : undefined, iat: payload.iat };
  } catch {
    return null;
  }
}

/**
 * Tương thích ngược: phiên ký trước khi có bảng UserSession (không có sid) vẫn dùng được thêm 24 giờ
 * sau mốc LEGACY_CUTOFF, rồi phải đăng nhập lại. Phiên không sid ký SAU mốc này luôn bị từ chối.
 */
export const LEGACY_CUTOFF = Date.parse("2026-11-08T00:00:00Z") / 1000;
const LEGACY_GRACE = 24 * 3600;
export const legacyOk = (iat: number | undefined, nowSec = Date.now() / 1000) => !!iat && iat < LEGACY_CUTOFF && nowSec < LEGACY_CUTOFF + LEGACY_GRACE;

const TOUCH_MS = 5 * 60_000;

/** Phiên còn hiệu lực (chưa thu hồi, đúng người). Nhớ trong một lần render; cập nhật lastSeenAt tối đa 5 phút/lần. */
const sessionAlive = cache(async (sid: string, uid: string) => {
  const row = await db.userSession.findUnique({ where: { id: sid }, select: { userId: true, revokedAt: true, lastSeenAt: true } });
  if (!row || row.userId !== uid || row.revokedAt) return false;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_MS) await db.userSession.update({ where: { id: sid }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return true;
});

export async function getSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
};

/** Ngữ cảnh đầy đủ cho trang server: người dùng, workspace, cấu hình đang dùng. */
export async function getContext() {
  const s = await getSession();
  if (!s) return null;
  if (s.sid ? !(await sessionAlive(s.sid, s.uid)) : !legacyOk(s.iat)) return null;
  const [user, workspace, cfg] = await Promise.all([
    db.user.findUnique({ where: { id: s.uid } }),
    db.workspace.findUnique({ where: { id: s.wid } }),
    db.workspaceConfig.findFirst({ where: { workspaceId: s.wid, isActive: true } }),
  ]);
  if (!user || !workspace) return null;
  const config = cfg ? parseJson<WorkspaceConfig | null>(cfg.configJson, null) : null;
  return { user, workspace, config, configVersion: cfg?.version ?? 0, sessionId: s.sid ?? "" };
}

export async function requireApp() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.config || !ctx.workspace.onboarded) redirect("/onboarding");
  // Chủ bắt buộc bật xác thực 2 lớp cho vai trò này: chuyển tới trang Bảo mật cho tới khi bật xong.
  if (!ctx.user.totpEnabled) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (!path.startsWith("/w/settings/security")) {
      const { securityPref, needs2fa } = await import("./security/sessions");
      const pref = await securityPref(ctx.workspace.id);
      if (pref.require2faFor !== "none") {
        const { getAccess } = await import("./permissions");
        if (needs2fa(pref, await getAccess(ctx.user.id, ctx.workspace.id))) redirect("/w/settings/security?required=1");
      }
    }
  }
  return { ...ctx, config: ctx.config };
}

/** Dùng trong route handler: trả null nếu chưa đăng nhập. */
export async function apiContext() {
  const ctx = await getContext();
  return ctx;
}

export async function isOwner(userId: string, workspaceId: string) {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  return m?.role === "owner";
}
