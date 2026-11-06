import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { METRICS } from "@/lib/kpi";
import { perfPref, perfRole } from "@/lib/perf/server";
import { PERF_DEFAULT, validateCriteria, type Criterion } from "@/lib/perf/shared";
import { METRIC_DEFS, METRIC_KEYS } from "@/lib/perf/metrics";

const SOURCES = ["manual", "csat", ...METRICS.map((m) => `kpi:${m}`), ...METRIC_KEYS.filter((k) => !METRIC_DEFS[k].snapshot).map((k) => `metric:${k}`)] as const;
const Body = z.object({
  criteria: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,30}$/i, "Mã tiêu chí chỉ gồm chữ, số, gạch"), label: z.string().max(80, "Tên tiêu chí tối đa 80 ký tự"), weight: z.number("Trọng số phải là số").min(0, "Trọng số không được âm").max(100, "Trọng số mỗi tiêu chí tối đa 100%"), source: z.enum(SOURCES, "Nguồn điểm không hợp lệ") }))
    .max(20, "Tối đa 20 tiêu chí"),
  reset: z.boolean().optional(),
});

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await perfPref(a.ctx.workspace.id));
}

/** Sửa bộ tiêu chí đánh giá (chỉ chủ). reset = true: về mặc định. Phiếu đã chốt giữ nguyên điểm đã chụp. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await perfRole(a.ctx)).owner) return fail("Chỉ chủ doanh nghiệp sửa được tiêu chí đánh giá", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const criteria = p.data.reset ? PERF_DEFAULT.criteria : (p.data.criteria.map((c) => ({ ...c, label: c.label.trim() })) as Criterion[]);
  const err = validateCriteria(criteria);
  if (err) return fail(err);
  const before = await perfPref(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "perf", { criteria });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "perf.criteria", "pref", "perf", `Sửa tiêu chí đánh giá (${criteria.length} tiêu chí)`, { before: before.criteria, after: criteria });
  return ok({ criteria });
}
