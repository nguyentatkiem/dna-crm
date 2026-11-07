// Phiên đăng nhập (UserSession), giới hạn số lần thử theo IP, khoá tạm tài khoản khi sai nhiều lần.
import bcrypt from "bcryptjs";
import { db, parseJson } from "../db";
import { getPref } from "../prefs";
import { normRecovery, openSecret, verifyTotp } from "./totp";

export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;

/** IP người dùng (sau proxy Caddy/Nginx lấy từ X-Forwarded-For). */
export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64);
}

export async function createSession(userId: string, h: Headers) {
  // Dọn phiên cũ của người này: đã thu hồi hoặc không dùng quá 30 ngày (JWT cũng hết hạn sau 30 ngày).
  const old = new Date(Date.now() - 30 * 864e5);
  await db.userSession.deleteMany({ where: { userId, OR: [{ revokedAt: { lt: old } }, { lastSeenAt: { lt: old } }] } }).catch(() => undefined);
  const s = await db.userSession.create({ data: { userId, ip: clientIp(h), userAgent: (h.get("user-agent") ?? "").slice(0, 300) } });
  return s.id;
}

export const revokeSession = (id: string, userId?: string) => db.userSession.updateMany({ where: { id, ...(userId ? { userId } : {}), revokedAt: null }, data: { revokedAt: new Date() } });

/** Thu hồi mọi phiên của một người, trừ phiên `exceptId` (nếu có). Trả số phiên đã thu hồi. */
export async function revokeAllSessions(userId: string, exceptId?: string) {
  const r = await db.userSession.updateMany({ where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { revokedAt: new Date() } });
  return r.count;
}

// ---------- Giới hạn theo IP (trong bộ nhớ, đủ cho một máy chủ) ----------

const g = globalThis as unknown as { crmLoginRate?: Map<string, number[]>; crmTotpUsed?: Map<string, number> };
const WINDOW = 15 * 60_000;
const PER_IP = 30;

/** Số lần thử SAI gần đây của khoá (vd. "ip:1.2.3.4") còn dưới giới hạn không. Không ghi thêm. */
export function rateOk(key: string, now = Date.now(), limit = PER_IP) {
  const list = (g.crmLoginRate?.get(key) ?? []).filter((t) => now - t < WINDOW);
  return list.length < limit;
}

/** Ghi một lần thử sai. */
export function rateHit(key: string, now = Date.now()) {
  const m = (g.crmLoginRate ??= new Map<string, number[]>());
  const list = (m.get(key) ?? []).filter((t) => now - t < WINDOW);
  list.push(now);
  m.set(key, list);
  if (m.size > 5000) for (const [k, v] of m) if (!v.some((t) => now - t < WINDOW)) m.delete(k);
}

// ---------- Mã 2 lớp ----------

type U = { id: string; totpSecret: string; recoveryJson: string };

/** Kiểm tra mã 6 số từ ứng dụng hoặc mã khôi phục (dùng một lần). Trả kiểu mã đã dùng hoặc null. */
export async function checkSecondFactor(u: U, code: string): Promise<"totp" | "recovery" | null> {
  const c = String(code ?? "").trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) {
    const secret = u.totpSecret ? openSecret(u.totpSecret) : null;
    const digits = c.replace(/\s/g, "");
    if (!secret || !verifyTotp(secret, digits)) return null;
    // Chống dùng lại: một mã 6 số chỉ đăng nhập được một lần (mã còn hiệu lực tối đa ~90 giây với cửa sổ ±1).
    const now = Date.now();
    const used = (g.crmTotpUsed ??= new Map<string, number>());
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    const key = `${u.id}:${digits}`;
    if (used.has(key)) return null;
    used.set(key, now + 120_000);
    return "totp";
  }
  const n = normRecovery(c);
  if (n.length !== 10) return null;
  const hashes = parseJson<string[]>(u.recoveryJson, []);
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(n, hashes[i])) {
      const rest = hashes.filter((_, j) => j !== i);
      await db.user.update({ where: { id: u.id }, data: { recoveryJson: JSON.stringify(rest) } });
      return "recovery";
    }
  }
  return null;
}

export const hashRecovery = (codes: string[]) => Promise.all(codes.map((c) => bcrypt.hash(normRecovery(c), 8)));

// ---------- Chính sách bắt buộc 2 lớp ----------

export type SecurityPref = { require2faFor: "none" | "owners" | "managers" };
export const SECURITY_DEFAULT: SecurityPref = { require2faFor: "none" };
export const securityPref = (workspaceId: string) => getPref<SecurityPref>(workspaceId, "security", SECURITY_DEFAULT);

/** Vai trò này có bị bắt buộc bật 2 lớp không. */
export function needs2fa(p: SecurityPref, a: { isOwner: boolean; base: string }) {
  if (p.require2faFor === "owners") return a.isOwner;
  if (p.require2faFor === "managers") return a.isOwner || a.base === "manager";
  return false;
}
