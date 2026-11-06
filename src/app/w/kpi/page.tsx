import { requireApp } from "@/lib/auth";
import { allowed } from "@/lib/permissions";
import { currentPeriod, isPeriod, isPeriodView, kpiBoard } from "@/lib/kpi";
import { PerfNav } from "@/components/perf/PerfNav";
import { KpiBoard } from "./KpiBoard";

export const dynamic = "force-dynamic";

export default async function KpiPage({ searchParams }: { searchParams: Promise<{ period?: string; view?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const [canEdit, board] = await Promise.all([allowed({ user, workspace }, "kpi_set"), kpiBoard(workspace.id, config, period, new Date(), isPeriodView(sp.view) ? sp.view : "month")]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PerfNav active="kpi" />
      <KpiBoard initial={board} me={user.name} canEdit={canEdit} />
    </div>
  );
}
