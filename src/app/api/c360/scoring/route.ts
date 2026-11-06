import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { can, getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { SCORE_EVENTS } from "@/lib/c360/scoring";
import { recomputeScores, saveScoringRules, scoringRules } from "@/lib/c360/behavior";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await scoringRules(a.ctx.workspace.id));
}

const Rules = z.object({
  enabled: z.boolean(),
  profileWeight: z.number().min(0).max(100),
  windowDays: z.number().min(7).max(365),
  decayPerIdleWeek: z.number().min(0).max(20),
  events: z.object(Object.fromEntries(SCORE_EVENTS.map((k) => [k, z.number().min(-50).max(50)])) as Record<(typeof SCORE_EVENTS)[number], z.ZodNumber>),
});

/** Lưu luật chấm điểm (chủ workspace). */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "manage_settings")) return fail("Chỉ chủ workspace được sửa luật chấm điểm", 403);
  const p = Rules.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const saved = await saveScoringRules(a.ctx.workspace.id, p.data);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "settings.scoring", "pref", "scoring", "Sửa luật chấm điểm theo hành vi", saved);
  return ok(saved);
}

/** "Tính lại ngay" cho mọi khách. */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "manage_settings")) return fail("Chỉ chủ workspace được tính lại điểm", 403);
  const r = await recomputeScores(a.ctx.workspace.id, a.ctx.config);
  return ok(r);
}
