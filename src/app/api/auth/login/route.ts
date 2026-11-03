import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = email ? await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { memberships: { include: { workspace: true } } } }) : null;
  if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) return fail("Email hoặc mật khẩu chưa đúng", 401);
  const m = user.memberships[0];
  if (!m) return fail("Tài khoản chưa thuộc workspace nào", 403);
  const res = ok({ redirect: m.workspace.onboarded ? "/w" : "/onboarding" });
  res.cookies.set(SESSION_COOKIE, await signSession({ uid: user.id, wid: m.workspaceId }), cookieOptions);
  return res;
}
