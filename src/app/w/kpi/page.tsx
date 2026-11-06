import { requireApp } from "@/lib/auth";
import { getRole } from "@/lib/permissions";
import { currentPeriod, isPeriod, isPeriodView, kpiBoard } from "@/lib/kpi";
import { KpiBoard } from "./KpiBoard";

export const dynamic = "force-dynamic";

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ period?: string; view?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const [role, board] = await Promise.all([getRole(user.id, workspace.id), kpiBoard(workspace.id, config, period, new Date(), isPeriodView(sp.view) ? sp.view : "month")]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <KpiBoard initial={board} me={user.name} canEdit={role !== "member"} />
    </div>
  );
}
