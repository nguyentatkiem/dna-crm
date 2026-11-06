import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { copyTargets, isPeriod, kpiBoard, prevPeriod } from "@/lib/kpi";

const Body = z.object({ period: z.string().refine(isPeriod, "Tháng không hợp lệ") });

/** Chép chỉ tiêu tháng trước sang tháng đang xem (chỉ điền ô trống). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  if ((await getRole(ctx.user.id, ctx.workspace.id)) === "member") return fail("Chỉ chủ và quản lý được đặt chỉ tiêu", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const n = await copyTargets(ctx.workspace.id, p.data.period);
  if (n) await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "kpi.copy", "kpi", p.data.period, `Chép ${n} chỉ tiêu từ tháng ${prevPeriod(p.data.period)} sang ${p.data.period}`);
  return ok({ copied: n, board: await kpiBoard(ctx.workspace.id, ctx.config, p.data.period) });
}
