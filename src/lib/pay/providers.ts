// Đọc và xác thực webhook giao dịch ngân hàng của Casso và SePay. Thuần (chỉ dùng node:crypto), không gọi mạng.
import { createHmac, timingSafeEqual } from "node:crypto";

export type IncomingTxn = { provider: "casso" | "sepay" | "manual"; externalId: string; amount: number; content: string; accountNo: string; at: Date; raw: unknown };

const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "2026-11-07 09:15:00" (giờ Việt Nam) hoặc ISO → Date. */
export function parseVnDate(v: unknown): Date {
  const s = str(v).trim();
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const d = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+07:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Lấy khoá từ "Authorization: Apikey <key>" (không phân biệt hoa thường), hoặc "Bearer <key>". */
export function apiKeyFrom(h: Headers) {
  const a = h.get("authorization") ?? "";
  const m = a.match(/^\s*(?:apikey|api-key|bearer)\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

// ---------------- SePay ----------------

/** SePay gửi "Authorization: Apikey <API key>" do người dùng tự đặt khi tạo webhook. */
export const verifySepay = (h: Headers, key: string) => !!key && safeEqual(apiKeyFrom(h), key);

export function parseSepay(body: unknown): IncomingTxn[] {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!b.id) return [];
  const inbound = str(b.transferType || "in").toLowerCase() === "in";
  const amount = num(b.transferAmount);
  return [{ provider: "sepay", externalId: str(b.id), amount: inbound ? amount : -amount, content: str(b.content || b.description), accountNo: str(b.accountNumber || b.subAccount), at: parseVnDate(b.transactionDate), raw: body }];
}

// ---------------- Casso ----------------

const sortDeep = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortDeep) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v;

/** Chữ ký Casso webhook V2: "X-Casso-Signature: t=<ms>,v1=<hex HMAC-SHA512(`${t}.${JSON đã sắp khoá}`)>". */
export function cassoSignature(body: unknown, secret: string, t: string) {
  return createHmac("sha512", secret).update(`${t}.${JSON.stringify(sortDeep(body))}`).digest("hex");
}

/**
 * Casso: chấp nhận (1) webhook V2 có chữ ký X-Casso-Signature, (2) webhook cũ gửi header "Secure-Token",
 * (3) "Authorization: Apikey <khoá>". Cả ba đều so với cùng một khoá bí mật của workspace.
 */
export function verifyCasso(h: Headers, body: unknown, secret: string, now = Date.now()) {
  if (!secret) return false;
  const sig = h.get("x-casso-signature");
  if (sig) {
    const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=") as [string, string]));
    if (!parts.t || !parts.v1) return false;
    // Chống phát lại: chữ ký quá 10 phút thì bỏ.
    const t = Number(parts.t);
    if (Number.isFinite(t) && t > 1e12 && Math.abs(now - t) > 10 * 60_000) return false;
    return safeEqual(cassoSignature(body, secret, parts.t), parts.v1);
  }
  const token = h.get("secure-token") ?? "";
  if (token) return safeEqual(token, secret);
  return safeEqual(apiKeyFrom(h), secret);
}

export function parseCasso(body: unknown): IncomingTxn[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = Array.isArray(b.data) ? b.data : b.data && typeof b.data === "object" ? [b.data] : [];
  return (list as Record<string, unknown>[])
    .filter((d) => d && (d.id != null || d.tid != null || d.reference != null))
    .map((d) => ({
      provider: "casso" as const,
      externalId: str(d.id ?? d.tid ?? d.reference),
      amount: num(d.amount),
      content: str(d.description),
      accountNo: str(d.accountNumber ?? d.bank_sub_acc_id ?? d.subAccId ?? d.virtualAccountNumber),
      at: parseVnDate(d.transactionDateTime ?? d.when),
      raw: d,
    }));
}
