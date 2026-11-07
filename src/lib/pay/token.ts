// Mã công khai cho trang thanh toán /p/<mã>: base64url(orderId).chữ ký HMAC (dùng chung SESSION_SECRET).
import { sign, verify } from "@/lib/marketing/tokens";

export function payToken(orderId: string) {
  const body = Buffer.from(orderId, "utf8").toString("base64url");
  return `${body}.${sign("pay", orderId)}`;
}

export function verifyPayToken(token: string): string | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  let id = "";
  try {
    id = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  return id && verify("pay", id, sig) ? id : null;
}
