import { requireApp } from "@/lib/auth";
import { currentPeriod, isPeriod, prevPeriod } from "@/lib/kpi";
import { perfBoard } from "@/lib/perf/review";
import { perfRole } from "@/lib/perf/server";
import { PerfNav } from "@/components/perf/PerfNav";
import { PerfClient } from "./PerfClient";

export const dynamic = "force-dynamic";

export default async function PerfPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  // Mặc định đánh giá tháng vừa kết thúc.
  const period = sp.period && isPeriod(sp.period) ? sp.period : prevPeriod(currentPeriod());
  const r = await perfRole({ user, workspace });
  const board = await perfBoard(workspace.id, config, period, r.manager ? undefined : user.name);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PerfNav active="review" />
      <PerfClient initial={board} me={user.name} canReview={r.manager} isOwner={r.owner} />
    </div>
  );
}
