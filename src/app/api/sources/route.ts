import { isOwner } from "@/lib/auth";
import { appApi, fail, ok } from "@/lib/http";
import { maskSettings, saveSettings, type Integrations } from "@/lib/settings";
import { getProvider } from "@/lib/sources/providers";

/** Lưu khoá kết nối của một nguồn. Ô để trống = giữ nguyên giá trị cũ. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await isOwner(a.ctx.user.id, a.ctx.workspace.id))) return fail("Chỉ chủ workspace được sửa kết nối", 403);
  const { provider, values } = (await req.json().catch(() => ({}))) as { provider?: string; values?: Record<string, string> };
  const p = provider === "call" ? { key: "call", secrets: [["secret", ""]] } : getProvider(provider ?? "");
  if (!p) return fail("Nguồn không hợp lệ");
  const allowed = new Set(p.secrets.map(([k]) => k));
  const clean = Object.fromEntries(Object.entries(values ?? {}).filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 500)]));
  const next = await saveSettings(a.ctx.workspace.id, { [p.key]: clean } as Integrations);
  return ok({ settings: maskSettings(next) });
}
