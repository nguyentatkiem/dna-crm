import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { isManager, ticketPref } from "@/lib/care/server";
import { listTeams } from "@/lib/perf/teams";
import { routingPref } from "@/lib/perf/server";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  // Kèm danh sách người phụ trách để nút "Tạo phiếu" ở trang khác không phải tải cấu hình riêng.
  // categories/teams: cho ô chọn phân loại và đội khi tạo phiếu (phân luồng theo bộ phận).
  const [pref, routing, teams, canManage] = await Promise.all([ticketPref(a.ctx.workspace.id), routingPref(a.ctx.workspace.id), listTeams(a.ctx.workspace.id), isManager(a.ctx)]);
  return ok({ ...pref, team: a.ctx.config.team, me: a.ctx.user.name, canManage, categories: routing.categories, teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color })) });
}

const H = z.number().min(0).max(24 * 60);
const Body = z.object({ slaHours: z.object({ urgent: H, high: H, normal: H, low: H }) });

/** Sửa số giờ SLA theo mức ưu tiên (chủ/quản lý). Chỉ áp cho phiếu tạo sau đó. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await isManager(a.ctx))) return fail("Chỉ chủ hoặc quản lý sửa được SLA", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Số giờ không hợp lệ");
  const cur = await ticketPref(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "ticket", { ...cur, ...p.data });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "ticket.sla", "pref", "ticket", "Sửa SLA phiếu hỗ trợ", { before: cur.slaHours, after: p.data.slaHours });
  return ok(p.data);
}
