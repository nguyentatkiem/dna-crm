// Tài khoản kênh ngoài Meta Page: WhatsApp Cloud API, Shopee, TikTok Shop (bảng ChannelAccount).
// credentialsJson là bí mật: chỉ đọc phía server, không bao giờ trả về trình duyệt hay ghi log.
import type { ChannelAccount } from "@prisma/client";
import { z } from "zod";
import { db, parseJson } from "../db";

export const PLATFORMS = ["whatsapp", "shopee", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<Platform, string> = { whatsapp: "WhatsApp", shopee: "Shopee", tiktok: "TikTok Shop" };

/* ───────────── Khoá từng nền tảng ───────────── */

export const WaCreds = z.object({
  /** Phone number ID (không phải số điện thoại) — trùng accountId. */
  phoneNumberId: z.string().trim().default(""),
  /** WhatsApp Business Account ID — để tải danh sách mẫu tin. */
  wabaId: z.string().trim().default(""),
  /** System user access token (vĩnh viễn) hoặc token tạm. */
  accessToken: z.string().trim().default(""),
  /** App Secret của ứng dụng Meta — kiểm chữ ký X-Hub-Signature-256. */
  appSecret: z.string().trim().default(""),
  /** Verify token tự đặt khi đăng ký webhook. */
  verifyToken: z.string().trim().default(""),
});
export type WaCreds = z.infer<typeof WaCreds>;

export const ShopeeCreds = z.object({
  partnerId: z.string().trim().default(""),
  partnerKey: z.string().trim().default(""),
  shopId: z.string().trim().default(""),
  accessToken: z.string().trim().default(""),
  refreshToken: z.string().trim().default(""),
  /** ISO — access token Shopee sống 4 giờ, refresh token 30 ngày. */
  expiresAt: z.string().default(""),
  refreshExpiresAt: z.string().default(""),
  /** Ghi đè máy chủ (sandbox: https://partner.test-stable.shopeemobile.com). */
  baseUrl: z.string().trim().default(""),
});
export type ShopeeCreds = z.infer<typeof ShopeeCreds>;

export const TiktokCreds = z.object({
  appKey: z.string().trim().default(""),
  appSecret: z.string().trim().default(""),
  /** Service ID trên Partner Center (dùng cho link uỷ quyền mới). */
  serviceId: z.string().trim().default(""),
  shopId: z.string().trim().default(""),
  shopCipher: z.string().trim().default(""),
  accessToken: z.string().trim().default(""),
  refreshToken: z.string().trim().default(""),
  expiresAt: z.string().default(""),
  refreshExpiresAt: z.string().default(""),
  baseUrl: z.string().trim().default(""),
  authBaseUrl: z.string().trim().default(""),
});
export type TiktokCreds = z.infer<typeof TiktokCreds>;

type CredsOf = { whatsapp: WaCreds; shopee: ShopeeCreds; tiktok: TiktokCreds };
const SCHEMA = { whatsapp: WaCreds, shopee: ShopeeCreds, tiktok: TiktokCreds };

export function credsOf<P extends Platform>(platform: P, a: Pick<ChannelAccount, "credentialsJson">): CredsOf[P] {
  const r = SCHEMA[platform].safeParse(parseJson(a.credentialsJson, {}));
  return (r.success ? r.data : SCHEMA[platform].parse({})) as CredsOf[P];
}

/** Cài đặt không bí mật (settingsJson). */
export type AccountSettings = {
  /** Lần cuối nhận webhook (ISO) — cho trang Kiểm tra kết nối. */
  lastWebhookAt?: string;
  lastError?: string;
  /** Mã chống giả mạo của luồng OAuth đang chờ. */
  oauthState?: string;
  /** Số đơn đã đồng bộ lần gần nhất. */
  lastSyncCount?: number;
  displayPhone?: string;
};
export const settingsOf = (a: Pick<ChannelAccount, "settingsJson">) => parseJson<AccountSettings>(a.settingsJson, {});

export async function patchSettings(id: string, patch: AccountSettings) {
  const a = await db.channelAccount.findUnique({ where: { id }, select: { settingsJson: true } });
  if (!a) return;
  await db.channelAccount.update({ where: { id }, data: { settingsJson: JSON.stringify({ ...settingsOf(a), ...patch }) } });
}

export async function patchCreds(id: string, patch: Record<string, string>) {
  const a = await db.channelAccount.findUnique({ where: { id }, select: { credentialsJson: true } });
  if (!a) return;
  await db.channelAccount.update({ where: { id }, data: { credentialsJson: JSON.stringify({ ...parseJson<Record<string, string>>(a.credentialsJson, {}), ...patch }) } });
}

/* ───────────── Chạy thử ───────────── */

const isDemo = (v?: string) => !!v && v.startsWith("demo_");

/**
 * Chạy thử (không gọi mạng): MESSAGING_DRY_RUN=1, hoặc bất kỳ khoá chính nào bắt đầu bằng "demo_".
 * Không bao giờ gọi API thật với khoá giả.
 */
export function isDryRunCreds(platform: Platform, a: Pick<ChannelAccount, "credentialsJson">) {
  if (process.env.MESSAGING_DRY_RUN === "1") return true;
  const c = credsOf(platform, a) as Record<string, string>;
  const keys = platform === "whatsapp" ? ["accessToken"] : platform === "shopee" ? ["partnerKey", "partnerId", "accessToken"] : ["appSecret", "appKey", "accessToken"];
  return keys.some((k) => isDemo(c[k]));
}
export const isDemoAccount = (platform: Platform, a: Pick<ChannelAccount, "credentialsJson">) => {
  const c = credsOf(platform, a) as Record<string, string>;
  return Object.values(c).some((v) => typeof v === "string" && isDemo(v));
};

/* ───────────── DTO ───────────── */

const mask = (t: string) => (t ? `••••${t.slice(-4)}` : "");
/** Khoá nào được hiện 4 ký tự cuối (còn lại chỉ báo đã điền). ID không bí mật thì hiện nguyên. */
const PUBLIC_KEYS = new Set(["phoneNumberId", "wabaId", "partnerId", "shopId", "appKey", "serviceId", "expiresAt", "refreshExpiresAt", "baseUrl", "authBaseUrl"]);

export type ChannelAccountDTO = {
  id: string;
  platform: Platform;
  accountId: string;
  name: string;
  active: boolean;
  demo: boolean;
  lastSyncAt: string | null;
  settings: AccountSettings;
  /** Khoá đã che. */
  creds: Record<string, string>;
  createdAt: string;
};

export function accountDTO(a: ChannelAccount): ChannelAccountDTO {
  const platform = a.platform as Platform;
  const c = credsOf(platform, a) as Record<string, string>;
  const { oauthState: _s, ...settings } = settingsOf(a);
  void _s;
  return {
    id: a.id,
    platform,
    accountId: a.accountId,
    name: a.name,
    active: a.active,
    demo: isDemoAccount(platform, a),
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    settings,
    creds: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, PUBLIC_KEYS.has(k) ? v : mask(v)])),
    createdAt: a.createdAt.toISOString(),
  };
}

export const findAccount = (workspaceId: string, platform: Platform, accountId: string) =>
  accountId ? db.channelAccount.findUnique({ where: { workspaceId_platform_accountId: { workspaceId, platform, accountId } } }) : Promise.resolve(null);

/** Đánh dấu vừa nhận webhook (không chặn luồng chính nếu lỗi). */
export const touchWebhook = (id: string) => patchSettings(id, { lastWebhookAt: new Date().toISOString() }).catch(() => {});
