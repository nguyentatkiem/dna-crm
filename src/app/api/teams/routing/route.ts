import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { listTeams } from "@/lib/perf/teams";
import { routingPref } from "@/lib/perf/server";
import { allowed } from "@/lib/permissions";

/** Cấu hình phân luồng phiếu hỗ trợ: phân loại, đội nhận theo phân loại, đội mặc định. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await routingPref(a.ctx.workspace.id));
}

const Body = z.object({
  categories: z.array(z.string().max(80)).max(50),
  rules: z.array(z.object({ category: z.string().max(80), teamId: z.string().max(40) })).max(100),
  defaultTeamId: z.string().max(40),
  autoAssign: z.boolean(),
});

/** Lưu phân luồng (chủ, quản lý). Bỏ phân loại trùng/rỗng, bỏ luật trỏ tới đội không tồn tại. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "teams_manage"))) return fail("Bạn chưa có quyền sửa phân luồng phiếu", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const ids = new Set((await listTeams(a.ctx.workspace.id)).map((t) => t.id));
  const categories = [...new Set(p.data.categories.map((c) => c.trim()).filter(Boolean))];
  const rules = p.data.rules.filter((r) => categories.includes(r.category.trim()) && ids.has(r.teamId)).map((r) => ({ category: r.category.trim(), teamId: r.teamId }));
  const value = { categories, rules, defaultTeamId: ids.has(p.data.defaultTeamId) ? p.data.defaultTeamId : "", autoAssign: p.data.autoAssign };
  const before = await routingPref(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "ticketRouting", value);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "ticket.routing", "pref", "ticketRouting", `Sửa phân luồng phiếu hỗ trợ (${categories.length} phân loại, ${rules.length} luật)`, { before, after: value });
  return ok(value);
}
