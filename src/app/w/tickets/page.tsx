import { requireApp } from "@/lib/auth";
import { careCan, ticketPref } from "@/lib/care/server";
import { listTeams } from "@/lib/perf/teams";
import { routingPref } from "@/lib/perf/server";
import { TicketsClient } from "./TicketsClient";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const { status } = await searchParams;
  const ctx = { user, workspace };
  const [manager, pref, teams, routing] = await Promise.all([careCan(ctx, "care_settings"), ticketPref(workspace.id), listTeams(workspace.id), routingPref(workspace.id)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <TicketsClient team={config.team} me={user.name} canManage={manager} sla={pref.slaHours} initialStatus={status ?? "open"} teams={teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))} categories={routing.categories} />
    </div>
  );
}
