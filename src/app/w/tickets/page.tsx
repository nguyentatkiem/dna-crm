import { requireApp } from "@/lib/auth";
import { isManager, ticketPref } from "@/lib/care/server";
import { TicketsClient } from "./TicketsClient";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const { status } = await searchParams;
  const ctx = { user, workspace };
  const [manager, pref] = await Promise.all([isManager(ctx), ticketPref(workspace.id)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <TicketsClient team={config.team} me={user.name} canManage={manager} sla={pref.slaHours} initialStatus={status ?? "open"} />
    </div>
  );
}
