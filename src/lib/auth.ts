import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, parseJson } from "./db";
import { WorkspaceConfig } from "./config/schema";

export const SESSION_COOKIE = "crm_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu SESSION_SECRET (ít nhất 32 ký tự) trong .env. Chạy: npm run setup");
  return new TextEncoder().encode(s);
};

export type Session = { uid: string; wid: string };

export async function signSession(s: Session) {
  return new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), wid: String(payload.wid) };
  } catch {
    return null;
  }
}

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
  const [user, workspace, cfg] = await Promise.all([
    db.user.findUnique({ where: { id: s.uid } }),
    db.workspace.findUnique({ where: { id: s.wid } }),
    db.workspaceConfig.findFirst({ where: { workspaceId: s.wid, isActive: true } }),
  ]);
  if (!user || !workspace) return null;
  const config = cfg ? parseJson<WorkspaceConfig | null>(cfg.configJson, null) : null;
  return { user, workspace, config, configVersion: cfg?.version ?? 0 };
}

export async function requireApp() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.config || !ctx.workspace.onboarded) redirect("/onboarding");
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
