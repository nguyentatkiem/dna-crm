import { requireApp } from "@/lib/auth";
import { currentPeriod, isPeriod } from "@/lib/kpi";
import { commissionBoard } from "@/lib/perf/commission";
import { perfRole } from "@/lib/perf/server";
import { PerfNav } from "@/components/perf/PerfNav";
import { CommissionClient } from "./CommissionClient";

export const dynamic = "force-dynamic";

export default async function CommissionPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  const period = sp.period && isPeriod(sp.period) ? sp.period : currentPeriod();
  const r = await perfRole({ user, workspace });
  const board = await commissionBoard(workspace.id, config, period, r.manager ? undefined : user.name);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PerfNav active="commission" />
      <CommissionClient initial={board} me={user.name} canEdit={r.owner} canSeeAll={r.manager} />
    </div>
  );
}
