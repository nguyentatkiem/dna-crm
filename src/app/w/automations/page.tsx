import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, getRole } from "@/lib/permissions";
import { AUTOMATION_AGENT, ruleName, ruleOf } from "@/lib/automation";
import { listTeams } from "@/lib/perf/teams";
import { Automations } from "./Automations";

export default async function AutomationsPage() {
  const { user, workspace, config } = await requireApp();
  const wid = workspace.id;
  const [rows, sequences, members, role, logs] = await Promise.all([
    db.automation.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } }),
    db.sequence.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    db.membership.findMany({ where: { workspaceId: wid }, select: { user: { select: { name: true } } } }),
    getRole(user.id, wid),
    db.agentLog.findMany({ where: { workspaceId: wid, agent: AUTOMATION_AGENT, message: { startsWith: "[" } }, orderBy: { createdAt: "desc" }, take: 500, select: { message: true, createdAt: true } }),
  ]);
  // Danh sách cho trình sửa luật (bảng chưa có thì để trống, không làm hỏng trang).
  const safe = <T,>(fn: () => Promise<T[]>) => Promise.resolve().then(fn).catch(() => [] as T[]);
  const [campaigns, surveys, forms, teams] = await Promise.all([
    safe(() => db.voucherCampaign.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } })),
    safe(() => db.survey.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } })),
    safe(() => db.landingPage.findMany({ where: { workspaceId: wid }, select: { slug: true, title: true }, orderBy: { createdAt: "desc" } })),
    safe(() => listTeams(wid)),
  ]);
  const team = [...new Set([...config.team, ...members.map((m) => m.user.name)])].filter(Boolean);
  return (
    <Automations
      config={config}
      canManage={can(role, "manage_automations")}
      team={team}
      sequences={sequences}
      lists={{ campaigns, surveys, teams: teams.map((t) => ({ id: t.id, name: t.name })), forms: forms.map((f) => ({ id: f.slug, name: f.title })) }}
      runs={logs.slice(0, 300).map((l) => ({ at: l.createdAt.toISOString(), message: l.message }))}
      initial={rows.map((r) => {
        const rule = ruleOf(r);
        const name = ruleName(rule, config);
        const last = logs.find((l) => l.message.startsWith(`[${name}]`));
        return { id: r.id, enabled: r.enabled, runs: r.runs, createdAt: r.createdAt.toISOString(), rule: { name: rule.name, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions }, lastRunAt: last?.createdAt.toISOString() ?? null };
      })}
    />
  );
}
