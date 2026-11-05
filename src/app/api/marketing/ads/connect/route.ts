import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { maskSettings, saveSettings, type Integrations } from "@/lib/settings";
import { marketingApi } from "@/lib/marketing/guard";

const FIELDS = {
  fbAds: ["accessToken", "adAccountId"],
  googleAds: ["developerToken", "clientId", "clientSecret", "refreshToken", "customerId", "loginCustomerId"],
} as const;

/** Lưu khoá tài khoản quảng cáo. Ô để trống = giữ nguyên. */
export async function PUT(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { provider, values } = (await req.json().catch(() => ({}))) as { provider?: keyof typeof FIELDS; values?: Record<string, string> };
  if (!provider || !(provider in FIELDS)) return fail("Nền tảng không hợp lệ");
  const allowed = new Set<string>(FIELDS[provider]);
  const clean = Object.fromEntries(Object.entries(values ?? {}).filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 1000)]));
  if (!Object.keys(clean).length) return fail("Chưa nhập khoá nào");
  const next = await saveSettings(a.ctx.workspace.id, { [provider]: clean } as Integrations);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "settings", provider, `Lưu khoá ${provider === "fbAds" ? "Facebook Ads" : "Google Ads"}: ${Object.keys(clean).join(", ")}`);
  return ok({ masked: maskSettings(next)[provider] ?? {} });
}
