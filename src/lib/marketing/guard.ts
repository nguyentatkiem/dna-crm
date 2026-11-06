import { maskSettings, type Integrations } from "../settings";
import { appApi, fail } from "../http";
import { accessOf, allow, PERM_LABEL, type Perm } from "../permissions";

/**
 * Route API của Marketing: đăng nhập + (tuỳ chọn) quyền cho thao tác ghi.
 * write = true → "Chiến dịch & chuỗi chăm sóc" (marketing_manage); hoặc truyền quyền cụ thể (broadcast_send, landing_manage, ads_manage...).
 */
export async function marketingApi(write: boolean | Perm) {
  const a = await appApi();
  if ("error" in a) return a;
  const access = await accessOf(a.ctx);
  const need: Perm | null = write === true ? "marketing_manage" : write || null;
  if (need && !allow(access, need)) return { error: fail(`Bạn chưa có quyền “${PERM_LABEL[need]}”. Hãy nhờ chủ workspace cấp quyền.`, 403) } as const;
  return { ctx: { ...a.ctx, role: access.base, access } } as const;
}

const CHANNEL_FIELDS = { zns: ["defaultTemplateId"], sms: ["provider", "apiKey", "secretKey", "brandname", "url"], email: ["host", "port", "user", "pass", "from"] } as const;
/** Trường không bí mật: trả nguyên giá trị để hiển thị. */
const PLAIN = { zns: ["defaultTemplateId"], sms: ["provider", "brandname", "url"], email: ["host", "port", "user", "from"] } as const;
export type ChannelKey = keyof typeof CHANNEL_FIELDS;
export const channelFields = (k: ChannelKey) => CHANNEL_FIELDS[k] as readonly string[];
export const isChannelKey = (k: unknown): k is ChannelKey => typeof k === "string" && k in CHANNEL_FIELDS;

/** Cấu hình kênh gửi cho trình duyệt: khoá bí mật bị che, trường thường giữ nguyên. */
export function channelView(s: Integrations) {
  const masked = maskSettings(s);
  const out: Record<string, Record<string, string>> = {};
  for (const k of Object.keys(CHANNEL_FIELDS) as ChannelKey[]) {
    out[k] = { ...(masked[k] ?? {}) };
    for (const f of PLAIN[k]) {
      const v = (s[k] as Record<string, string> | undefined)?.[f];
      if (v) out[k][f] = v;
    }
  }
  out.zalo = masked.zalo ?? {};
  return out;
}
