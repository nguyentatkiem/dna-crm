// Mã xác thực 2 lớp TOTP (RFC 6238 / RFC 4226), tự viết bằng node:crypto — dùng được với Google Authenticator,
// Microsoft Authenticator, Authy, 1Password... Bí mật lưu trong DB được mã hoá AES-256-GCM bằng SESSION_SECRET.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648). pad=false bỏ dấu "=" (ứng dụng xác thực không cần). */
export function base32Encode(buf: Buffer, pad = true) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  if (pad) while (out.length % 8) out += "=";
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Chuỗi base32 không hợp lệ");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) với HMAC-SHA1. */
export function hotp(key: Buffer, counter: number, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** TOTP (RFC 6238): bước 30 giây. */
export function totp(key: Buffer, timeMs = Date.now(), digits = 6, step = 30) {
  return hotp(key, Math.floor(timeMs / 1000 / step), digits);
}

/** Kiểm tra mã 6 số, cho lệch ±window bước (đồng hồ điện thoại chạy sai vài giây). */
export function verifyTotp(secretB32: string, code: string, timeMs = Date.now(), window = 1) {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  let key: Buffer;
  try {
    key = base32Decode(secretB32);
  } catch {
    return false;
  }
  const t = Math.floor(timeMs / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const exp = Buffer.from(hotp(key, t + w));
    if (timingSafeEqual(exp, Buffer.from(c))) return true;
  }
  return false;
}

/** Bí mật mới 20 byte (160 bit, như khuyến nghị RFC 4226). */
export const newTotpSecret = () => base32Encode(randomBytes(20), false);

export function otpauthUri(secretB32: string, account: string, issuer = "DNA CRM") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Mã hoá bí mật khi lưu DB ----------

const encKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu SESSION_SECRET");
  return createHash("sha256").update(`totp:${s}`).digest();
};

export function sealSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function openSecret(sealed: string): string | null {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** 10 mã khôi phục dạng xxxxx-xxxxx (chữ thường + số, bỏ ký tự dễ nhầm). */
export function newRecoveryCodes(n = 10) {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = [...b].map((x) => A[x % A.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normRecovery = (s: string) => String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
