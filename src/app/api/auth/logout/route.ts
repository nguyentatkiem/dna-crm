import { SESSION_COOKIE, getSession } from "@/lib/auth";
import { ok } from "@/lib/http";
import { revokeSession } from "@/lib/security/sessions";

/** Đăng xuất: thu hồi phiên hiện tại trong DB (cookie bị lộ cũng không dùng lại được) rồi xoá cookie. */
export async function POST() {
  const s = await getSession();
  if (s?.sid) await revokeSession(s.sid, s.uid).catch(() => undefined);
  const res = ok({ redirect: "/login" });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
