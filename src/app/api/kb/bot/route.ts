import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { ai } from "@/lib/ai";
import { canManageKb } from "@/lib/kb/api";
import { loadBotPref, saveBotPref } from "@/lib/kb/bot";
import { BotPrefSchema } from "@/lib/kb/shared";
import { loadAssignPref } from "@/lib/chat/assign";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const [pref, canManage, assign] = await Promise.all([loadBotPref(a.ctx.workspace.id), canManageKb(a.ctx), loadAssignPref(a.ctx.workspace.id)]);
  return ok({ pref, canManage, aiAvailable: !!ai(), workingHours: assign.workingHours });
}

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền cài đặt chatbot", 403);
  const p = BotPrefSchema.partial().safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const before = await loadBotPref(a.ctx.workspace.id);
  const pref = await saveBotPref(a.ctx.workspace.id, p.data);
  const what = before.enabled !== pref.enabled ? (pref.enabled ? "Bật chatbot" : "Tắt chatbot") : "Sửa cài đặt chatbot";
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.bot", "kb", "", what);
  return ok({ pref });
}
