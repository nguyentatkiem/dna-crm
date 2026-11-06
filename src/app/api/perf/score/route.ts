import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { perfAccess } from "@/lib/perf/access";
import { perfScorePref } from "@/lib/perf/board";
import { METRIC_KEYS, SCORE_DEFAULT, SCORE_EXPLAIN } from "@/lib/perf/metrics";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok({ ...(await perfScorePref(a.ctx.workspace.id)), explain: SCORE_EXPLAIN, defaults: SCORE_DEFAULT });
}

const Body = z.object({
  weights: z.partialRecord(z.enum(METRIC_KEYS), z.number("Trọng số phải là số").min(0, "Trọng số không được âm").max(100, "Trọng số tối đa 100")).optional(),
  staleDays: z.number().int().min(1, "Số ngày tồn đọng từ 1").max(365, "Số ngày tồn đọng tối đa 365").optional(),
  reset: z.boolean().optional(),
});

/** Sửa trọng số Điểm hiệu suất và ngưỡng tồn đọng (chỉ chủ). reset = true: về mặc định. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await perfAccess(a.ctx)).canConfigure) return fail("Chỉ chủ doanh nghiệp sửa được cách tính điểm hiệu suất", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const cur = await perfScorePref(a.ctx.workspace.id);
  const weights = p.data.reset ? SCORE_DEFAULT : Object.fromEntries(Object.entries(p.data.weights ?? cur.weights).filter(([, v]) => (v ?? 0) > 0));
  if (!Object.keys(weights).length) return fail("Cần ít nhất một chỉ số có trọng số lớn hơn 0");
  const next = { weights, staleDays: p.data.reset ? 14 : (p.data.staleDays ?? cur.staleDays) };
  await setPref(a.ctx.workspace.id, "perfScore", next);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "perf.score", "pref", "perfScore", "Sửa cách tính điểm hiệu suất", { before: cur, after: next });
  return ok(await perfScorePref(a.ctx.workspace.id));
}
