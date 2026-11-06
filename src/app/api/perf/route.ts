import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { currentPeriod, isPeriod, prevPeriod } from "@/lib/kpi";
import { perfBoard, saveReview } from "@/lib/perf/review";
import { perfRole } from "@/lib/perf/server";

/** Bảng đánh giá nhân viên của một tháng (?period=YYYY-MM, mặc định tháng trước). Nhân viên chỉ thấy phiếu của mình. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = new URL(req.url).searchParams.get("period") ?? prevPeriod(currentPeriod());
  if (!isPeriod(p)) return fail("Tháng không hợp lệ (YYYY-MM)");
  const r = await perfRole(a.ctx);
  const board = await perfBoard(a.ctx.workspace.id, a.ctx.config, p, r.manager ? undefined : a.ctx.user.name);
  return ok({ ...board, me: a.ctx.user.name, canReview: r.manager, isOwner: r.owner });
}

const Put = z.object({
  period: z.string().refine(isPeriod, "Tháng không hợp lệ"),
  who: z.string().min(1).max(120),
  scores: z.record(z.string(), z.number().min(0).max(100).nullable()).optional(),
  comment: z.string().max(2000).optional(),
  finalize: z.boolean().optional(),
  reopen: z.boolean().optional(),
});

/** Chấm điểm tay / nhận xét / chốt đánh giá (chủ, quản lý). Phiếu đã chốt chỉ chủ sửa hoặc mở lại. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const r = await perfRole(a.ctx);
  if (!r.manager) return fail("Chỉ chủ và quản lý được chấm điểm", 403);
  const p = Put.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const res = await saveReview(a.ctx.workspace.id, a.ctx.config, p.data, { name: a.ctx.user.name, isOwner: r.owner });
  if ("error" in res) return fail(res.error, 403);
  const what = p.data.reopen ? "Mở lại" : p.data.finalize ? "Chốt" : "Lưu";
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, p.data.finalize ? "perf.finalize" : p.data.reopen ? "perf.reopen" : "perf.update", "perf", `${p.data.period}:${p.data.who}`, `${what} đánh giá ${p.data.who} tháng ${p.data.period} (${res.total} điểm)`, p.data.scores);
  return ok({ ...res, board: await perfBoard(a.ctx.workspace.id, a.ctx.config, p.data.period) });
}
