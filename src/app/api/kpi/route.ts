import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { currentPeriod, isPeriod, isPeriodView, isTeamKey, kpiBoard, METRIC_LABEL, METRICS, setTargets } from "@/lib/kpi";
import { listTeams } from "@/lib/perf/teams";

/** Bảng KPI: ?period=YYYY-MM (mặc định tháng này), ?view=month|quarter|year (quý/năm chứa tháng đó). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const p = sp.get("period") ?? currentPeriod();
  if (!isPeriod(p)) return fail("Tháng không hợp lệ (YYYY-MM)");
  const v = sp.get("view");
  const board = await kpiBoard(a.ctx.workspace.id, a.ctx.config, p, new Date(), isPeriodView(v) ? v : "month");
  return ok({ ...board, me: a.ctx.user.name, canEdit: await allowed(a.ctx, "kpi_set") });
}

const Put = z.object({
  period: z.string().refine(isPeriod, "Tháng không hợp lệ"),
  cells: z
    .array(z.object({ who: z.string().max(80), metric: z.enum(METRICS), target: z.number().min(0).max(1e13).nullable() }))
    .min(1)
    .max(500),
});

/** Đặt chỉ tiêu (chủ, quản lý). target = null hoặc 0 để xoá ô. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  if (!(await allowed(ctx, "kpi_set"))) return fail("Bạn chưa có quyền đặt chỉ tiêu KPI", 403);
  const p = Put.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  // Chỉ tiêu đội: who = "team:<id>" phải là đội có thật trong workspace.
  const teamNames = new Map((await listTeams(ctx.workspace.id)).map((t) => [`team:${t.id}`, `Đội ${t.name}`]));
  const teamIds = new Set(teamNames.keys());
  const bad = p.data.cells.find((c) => isTeamKey(c.who) && !teamIds.has(c.who));
  if (bad) return fail("Không tìm thấy đội", 404);
  const cells = p.data.cells.map((c) => ({ ...c, target: c.metric === "win_rate" && c.target !== null ? Math.min(100, c.target) : c.target }));
  await setTargets(ctx.workspace.id, p.data.period, cells);
  const diff = Object.fromEntries(cells.map((c) => [`${teamNames.get(c.who) ?? (c.who || "Cả công ty")} · ${METRIC_LABEL[c.metric]}`, c.target ?? 0]));
  await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "kpi.update", "kpi", p.data.period, `Đặt chỉ tiêu tháng ${p.data.period} (${cells.length} ô)`, diff);
  return ok(await kpiBoard(ctx.workspace.id, ctx.config, p.data.period));
}
