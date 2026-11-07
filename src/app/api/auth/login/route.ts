import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { LOCK_MINUTES, MAX_FAILED, checkSecondFactor, clientIp, createSession, rateHit, rateOk } from "@/lib/security/sessions";
import { deviceOf } from "@/lib/security/device";

const GENERIC = "Email hoặc mật khẩu chưa đúng";
// Băm giả để thời gian trả lời như nhau dù email có tồn tại hay không.
let dummy = "";
const DUMMY = () => (dummy ||= bcrypt.hashSync("khong-phai-mat-khau", 10));

/**
 * Đăng nhập: { email, password, code? }.
 * - Sai 5 lần liên tiếp: khoá tạm 15 phút. Mỗi IP tối đa 30 lần thử sai / 15 phút.
 * - Bật 2 lớp mà chưa gửi code: trả { need2fa: true } (chưa tính là sai). code là mã 6 số hoặc mã khôi phục.
 * - Thành công: tạo UserSession, JWT mang sid.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers) || "local";
  if (!rateOk(`ip:${ip}`)) return fail("Bạn thử đăng nhập quá nhiều lần. Hãy đợi 15 phút rồi thử lại.", 429);
  const { email, password, code } = (await req.json().catch(() => ({}))) as { email?: string; password?: string; code?: string };
  const em = String(email ?? "").trim().toLowerCase();
  const user = em ? await db.user.findUnique({ where: { email: em }, include: { memberships: { include: { workspace: true } } } }) : null;
  const m = user?.memberships[0];
  const who = (u: { id: string; name: string }) => ({ workspaceId: m?.workspaceId ?? "", user: u });
  const where = `${deviceOf(req.headers.get("user-agent") ?? "")}${ip !== "local" ? `, IP ${ip}` : ""}`;

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    return fail(`Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${mins} phút hoặc nhờ chủ workspace đặt lại mật khẩu.`, 423);
  }
  const passOk = await bcrypt.compare(String(password ?? ""), user?.passwordHash ?? DUMMY());
  if (!user || !password || !passOk) {
    rateHit(`ip:${ip}`);
    if (user) await failed(user, m?.workspaceId, where, "sai mật khẩu");
    return fail(GENERIC, 401);
  }
  if (user.totpEnabled) {
    if (!code) return ok({ need2fa: true });
    const kind = await checkSecondFactor(user, code);
    if (!kind) {
      rateHit(`ip:${ip}`);
      await failed(user, m?.workspaceId, where, "sai mã xác thực 2 lớp");
      return fail("Mã xác thực chưa đúng hoặc đã hết hạn", 401);
    }
    if (kind === "recovery" && m) await audit(who(user), "auth.recovery_used", "user", user.id, `${user.name} đăng nhập bằng mã khôi phục (${where})`);
  }
  if (!m) return fail("Tài khoản chưa thuộc workspace nào", 403);

  if (user.failedLogins || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  const sid = await createSession(user.id, req.headers);
  await audit(who(user), "auth.login", "user", user.id, `${user.name} đăng nhập (${where})`);
  const res = ok({ redirect: m.workspace.onboarded ? "/w" : "/onboarding" });
  res.cookies.set(SESSION_COOKIE, await signSession({ uid: user.id, wid: m.workspaceId, sid }), cookieOptions);
  return res;
}

async function failed(user: { id: string; name: string; failedLogins: number }, workspaceId: string | undefined, where: string, why: string) {
  const n = user.failedLogins + 1;
  const lock = n >= MAX_FAILED;
  await db.user.update({ where: { id: user.id }, data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: n } });
  if (!workspaceId) return;
  const who = { workspaceId, user: { id: user.id, name: user.name } };
  await audit(who, "auth.login_fail", "user", user.id, `Đăng nhập không thành công vào tài khoản ${user.name}: ${why} (${where})`);
  if (lock) {
    await audit(who, "auth.lockout", "user", user.id, `Khoá tạm ${LOCK_MINUTES} phút tài khoản ${user.name} sau ${MAX_FAILED} lần đăng nhập sai (${where})`);
    await notify(workspaceId, { userId: user.id, kind: "system", text: `Tài khoản của bạn bị khoá tạm ${LOCK_MINUTES} phút vì đăng nhập sai ${MAX_FAILED} lần (${where}). Nếu không phải bạn, hãy đổi mật khẩu.`, href: "/w/settings/security" });
  }
}
