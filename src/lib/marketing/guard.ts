import { maskSettings, type Integrations } from "../settings";
import { appApi, fail } from "../http";
import { can, getRole } from "../permissions";

/** Route API của Marketing: đăng nhập + (tuỳ chọn) quyền manage_marketing cho thao tác ghi. */
export async function marketingApi(write: boolean) {
  const a = await appApi();
  if ("error" in a) return a;
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  if (write && !can(role, "manage_marketing")) return { error: fail("Chỉ chủ hoặc quản lý được thay đổi phần Marketing", 403) } as const;
  return { ctx: { ...a.ctx, role } } as const;
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
