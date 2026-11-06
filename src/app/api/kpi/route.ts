import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { currentPeriod, isPeriod, kpiBoard, METRIC_LABEL, METRICS, setTargets } from "@/lib/kpi";

/** Bảng KPI của một tháng: ?period=YYYY-MM (mặc định tháng này). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = new URL(req.url).searchParams.get("period") ?? currentPeriod();
  if (!isPeriod(p)) return fail("Tháng không hợp lệ (YYYY-MM)");
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  const board = await kpiBoard(a.ctx.workspace.id, a.ctx.config, p);
  return ok({ ...board, me: a.ctx.user.name, canEdit: role !== "member" });
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
  if ((await getRole(ctx.user.id, ctx.workspace.id)) === "member") return fail("Chỉ chủ và quản lý được đặt chỉ tiêu", 403);
  const p = Put.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const cells = p.data.cells.map((c) => ({ ...c, target: c.metric === "win_rate" && c.target !== null ? Math.min(100, c.target) : c.target }));
  await setTargets(ctx.workspace.id, p.data.period, cells);
  const diff = Object.fromEntries(cells.map((c) => [`${c.who || "Cả công ty"} · ${METRIC_LABEL[c.metric]}`, c.target ?? 0]));
  await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "kpi.update", "kpi", p.data.period, `Đặt chỉ tiêu tháng ${p.data.period} (${cells.length} ô)`, diff);
  return ok(await kpiBoard(ctx.workspace.id, ctx.config, p.data.period));
}
