// Cài đặt Thanh toán (Pref "payments") và trạng thái webhook (Pref "payments_status"). Chỉ dùng ở server.
import { randomBytes } from "node:crypto";
import { getPref, setPref } from "@/lib/prefs";
import { normPrefix } from "./vietqr";

export type PaySettings = {
  bankBin: string;
  accountNo: string;
  accountName: string;
  payCodePrefix: string;
  /** Khoá bí mật dán vào Casso (Secure-Token / khoá chữ ký webhook V2). */
  cassoSecret: string;
  /** API key dán vào SePay (SePay gửi "Authorization: Apikey <key>"). */
  sepayKey: string;
  /** Lệch số tiền chấp nhận được khi tự ghép (làm tròn, phí). */
  tolerance: number;
  /** Cho phép trang công khai /p/<mã> để khách tự quét QR. */
  publicPage: boolean;
};

export const PAY_DEFAULT: PaySettings = { bankBin: "", accountNo: "", accountName: "", payCodePrefix: "DH", cassoSecret: "", sepayKey: "", tolerance: 1000, publicPage: true };

export type PayStatus = { lastWebhookAt?: string; lastProvider?: string; lastError?: string; lastErrorAt?: string; received?: number };

export const SECRET_FIELDS = ["cassoSecret", "sepayKey"] as const;

export async function paySettings(workspaceId: string): Promise<PaySettings> {
  const s = await getPref<PaySettings>(workspaceId, "payments", PAY_DEFAULT);
  return { ...s, payCodePrefix: normPrefix(s.payCodePrefix) };
}

export const savePaySettings = (workspaceId: string, s: PaySettings) => setPref(workspaceId, "payments", s);

export const payStatus = (workspaceId: string) => getPref<PayStatus>(workspaceId, "payments_status", {});

export async function markWebhook(workspaceId: string, provider: string, error?: string) {
  const cur = await payStatus(workspaceId);
  const now = new Date().toISOString();
  await setPref(workspaceId, "payments_status", error ? { ...cur, lastError: `${provider}: ${error}`.slice(0, 200), lastErrorAt: now } : { ...cur, lastWebhookAt: now, lastProvider: provider, received: (cur.received ?? 0) + 1 });
}

export const newSecret = () => randomBytes(18).toString("base64url");

/** Che khoá bí mật trước khi gửi ra trình duyệt. */
export const mask = (v: string) => (v ? `••••${v.slice(-4)}` : "");

export const bankConfigured = (s: PaySettings) => !!(s.bankBin && s.accountNo);

/** Chạy khô: không gọi API thật của nhà cung cấp (dev, kiểm thử). */
export const payDryRun = () => process.env.PAY_DRY_RUN === "1" || process.env.NODE_ENV === "test" || !!process.env.VITEST;
