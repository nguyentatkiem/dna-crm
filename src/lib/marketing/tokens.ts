// Mã ký HMAC cho link công khai: huỷ nhận tin, pixel mở email, chuyển hướng khi nhấp link.
// Dùng chung SESSION_SECRET với phiên đăng nhập. Không import db ở đây để dễ kiểm thử.
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("Thiếu SESSION_SECRET (ít nhất 32 ký tự) trong .env");
  return s;
};

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** Chữ ký ngắn (16 byte, base64url) cho một chuỗi, tách theo mục đích để mã này không dùng được cho mục khác. */
export function sign(purpose: string, data: string) {
  return createHmac("sha256", secret()).update(`${purpose}\n${data}`).digest().subarray(0, 16).toString("base64url");
}

export function verify(purpose: string, data: string, sig: string) {
  if (!sig) return false;
  const a = Buffer.from(sign(purpose, data));
  const b = Buffer.from(String(sig));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------- Huỷ nhận tin ----------------

export type UnsubPayload = { workspaceId: string; channel: string; address: string };

/** Mã huỷ nhận tin: base64url("w|c|a").chữ ký. Đủ ngắn để chèn vào SMS. */
export function unsubToken(p: UnsubPayload) {
  const raw = `${p.workspaceId}|${p.channel}|${p.address}`;
  return `${b64(raw)}.${sign("unsub", raw)}`;
}

export function verifyUnsubToken(token: string): UnsubPayload | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  let raw = "";
  try {
    raw = unb64(body);
  } catch {
    return null;
  }
  if (!verify("unsub", raw, sig)) return null;
  const [workspaceId, channel, ...rest] = raw.split("|");
  const address = rest.join("|");
  if (!workspaceId || !channel || !address) return null;
  return { workspaceId, channel, address };
}

// ---------------- Theo dõi mở / nhấp ----------------

export function openSig(broadcastId: string, recordId: string) {
  return sign("open", `${broadcastId}|${recordId}`);
}

export function clickSig(broadcastId: string, recordId: string, url: string) {
  return sign("click", `${broadcastId}|${recordId}|${url}`);
}

export function openUrl(origin: string, broadcastId: string, recordId: string) {
  const q = new URLSearchParams({ b: broadcastId, r: recordId, s: openSig(broadcastId, recordId) });
  return `${origin}/api/public/track/open?${q}`;
}

export function clickUrl(origin: string, broadcastId: string, recordId: string, url: string) {
  const q = new URLSearchParams({ b: broadcastId, r: recordId, u: url, s: clickSig(broadcastId, recordId, url) });
  return `${origin}/api/public/track/click?${q}`;
}

// ---------------- Link trong nội dung ----------------

const URL_RE = /https?:\/\/[^\s<>"'()]+/gi;
/** Bỏ dấu câu dính ở cuối link: "xem tại https://a.vn/x." */
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");

/** Mọi link http(s) xuất hiện trong nội dung gốc. */
export function extractLinks(body: string): string[] {
  return [...new Set((String(body ?? "").match(URL_RE) ?? []).map(trimUrl))];
}

/** Chỉ chuyển hướng tới link http(s) có trong nội dung gốc của đợt gửi, để không thành open redirect. */
export function isAllowedClick(originalBody: string, url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return extractLinks(originalBody).includes(url);
}

/** Thay từng link bằng link theo dõi; link do hệ thống thêm (huỷ nhận tin) giữ nguyên. */
export function rewriteLinks(body: string, wrap: (url: string) => string, keep: (url: string) => boolean = () => false) {
  return String(body ?? "").replace(URL_RE, (m) => {
    const url = trimUrl(m);
    const tail = m.slice(url.length);
    return keep(url) ? m : wrap(url) + tail;
  });
}

/** Che bớt địa chỉ khi hiện trên trang công khai: lan***@gmail.com, 0912***678. */
export function maskAddress(a: string) {
  if (a.includes("@")) {
    const [u, d] = a.split("@");
    return `${u.slice(0, 3)}***@${d}`;
  }
  return a.length > 6 ? `${a.slice(0, 4)}***${a.slice(-3)}` : "***";
}
