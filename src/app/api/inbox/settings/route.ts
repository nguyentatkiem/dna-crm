import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { setPref } from "@/lib/prefs";
import { allowed } from "@/lib/permissions";
import { knownPeople, listTeams } from "@/lib/perf/teams";
import { ASSIGN_PREF, loadAssignPref, staffNames } from "@/lib/chat/assign";
import { InboxAssignSchema, normAssignPref, MODE_INFO, METHOD_INFO } from "@/lib/chat/assign-shared";
import { presenceList } from "@/lib/chat/presence";

/** Cài đặt chia hội thoại + giờ làm việc + quyền xem (Pref "inboxAssign"). Cần quyền "Cài đặt hộp thư". */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "inbox_settings"))) return fail("Bạn chưa có quyền cài đặt hộp thư", 403);
  const wid = a.ctx.workspace.id;
  const [pref, staff, people, teams, presence] = await Promise.all([loadAssignPref(wid), staffNames(wid), knownPeople(wid, a.ctx.config.team), listTeams(wid), presenceList(wid)]);
  return ok({ pref, staff, people, teams, presence });
}

export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "inbox_settings"))) return fail("Bạn chưa có quyền cài đặt hộp thư", 403);
  const p = InboxAssignSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Cài đặt chưa hợp lệ");
  const wid = a.ctx.workspace.id;
  const next = normAssignPref(p.data);
  if (next.mode === "auto" && next.groups.length && !next.groups.some((g) => g.ratio > 0 && g.members.length)) return fail("Cần ít nhất một nhóm có người và tỉ lệ lớn hơn 0");
  const before = await loadAssignPref(wid);
  await setPref(wid, ASSIGN_PREF, next);
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "inbox_settings", ASSIGN_PREF, `Cài đặt chia hội thoại: ${MODE_INFO[next.mode].title}${next.mode === "auto" ? ` · ${METHOD_INFO[next.method].title} · ${next.groups.length} nhóm` : ""}`, { before: { mode: before.mode, method: before.method }, after: { mode: next.mode, method: next.method } });
  return ok({ pref: next });
}
