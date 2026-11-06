import { requireApp } from "@/lib/auth";
import { perfAccess } from "@/lib/perf/access";
import { overviewBoard, rangeFromQuery } from "@/lib/perf/board";
import { PerfNav } from "@/components/perf/PerfNav";
import { OverviewClient } from "./OverviewClient";

export const dynamic = "force-dynamic";

type SP = { range?: string; from?: string; to?: string; team?: string; metric?: string };

export default async function PerfOverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user, workspace, config } = await requireApp();
  const sp = await searchParams;
  const access = await perfAccess({ user, workspace });
  const board = await overviewBoard(workspace.id, config, access, { ...rangeFromQuery(sp), teamId: sp.team, metric: sp.metric });
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PerfNav active="overview" />
      <OverviewClient initial={board} />
    </div>
  );
}
