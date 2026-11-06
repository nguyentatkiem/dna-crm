import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { currentPeriod, isPeriod } from "@/lib/kpi";
import { commissionBoard } from "@/lib/perf/commission";
import { commissionRules, perfRole } from "@/lib/perf/server";
import { normTiers } from "@/lib/perf/shared";

/** Bảng hoa hồng của một tháng (?period=YYYY-MM, mặc định tháng này). Nhân viên chỉ thấy dòng của mình. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = new URL(req.url).searchParams.get("period") ?? currentPeriod();
  if (!isPeriod(p)) return fail("Tháng không hợp lệ (YYYY-MM)");
  const r = await perfRole(a.ctx);
  const board = await commissionBoard(a.ctx.workspace.id, a.ctx.config, p, r.manager ? undefined : a.ctx.user.name);
  return ok({ ...board, me: a.ctx.user.name, canEdit: r.owner, canSeeAll: r.manager });
}

const Body = z.object({
  base: z.enum(["paid", "done"]),
  mode: z.enum(["progressive", "bracket"]),
  tiers: z.array(z.object({ from: z.number().min(0).max(1e13), pct: z.number().min(0).max(100) })).min(1, "Cần ít nhất một bậc").max(20),
  teamLeaderPct: z.number().min(0).max(100),
});

/** Sửa quy tắc hoa hồng (chỉ chủ). */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await perfRole(a.ctx)).owner) return fail("Chỉ chủ doanh nghiệp sửa được quy tắc hoa hồng", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const value = { ...p.data, tiers: normTiers(p.data.tiers) };
  const before = await commissionRules(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "commission", value);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "perf.commission", "pref", "commission", "Sửa quy tắc hoa hồng", { before, after: value });
  return ok(value);
}
