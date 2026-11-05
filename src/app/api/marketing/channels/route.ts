import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings, type Integrations } from "@/lib/settings";
import { db } from "@/lib/db";
import { channelFields, channelView, isChannelKey, marketingApi } from "@/lib/marketing/guard";

export async function GET() {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: a.ctx.workspace.id } });
  return ok(channelView(getSettings(ws)));
}

/** Lưu cấu hình kênh gửi tin. Ô để trống = giữ nguyên. */
export async function PUT(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { channel, values } = (await req.json().catch(() => ({}))) as { channel?: string; values?: Record<string, string> };
  if (!isChannelKey(channel)) return fail("Kênh không hợp lệ");
  const allowed = new Set<string>(channelFields(channel));
  const clean = Object.fromEntries(Object.entries(values ?? {}).filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 500)]));
  if (channel === "sms" && clean.provider && !["esms", "speedsms", "http"].includes(clean.provider)) return fail("Nhà cung cấp SMS không hợp lệ");
  if (!Object.keys(clean).length) return fail("Chưa nhập gì");
  const next = await saveSettings(a.ctx.workspace.id, { [channel]: clean } as Integrations);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "settings", channel, `Lưu cấu hình kênh gửi ${channel.toUpperCase()}: ${Object.keys(clean).join(", ")}`);
  return ok(channelView(next));
}
