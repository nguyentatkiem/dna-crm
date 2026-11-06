import { requireApp } from "@/lib/auth";
import { perfAccess } from "@/lib/perf/access";
import { personBoard, rangeFromQuery } from "@/lib/perf/board";
import { PerfNav } from "@/components/perf/PerfNav";
import { EmptyState } from "@/components/ui";
import { PersonClient } from "./PersonClient";

export const dynamic = "force-dynamic";

type SP = { range?: string; from?: string; to?: string };

export default async function PerfPersonPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<SP> }) {
  const { user, workspace, config } = await requireApp();
  const who = decodeURIComponent((await params).name).trim();
  const sp = await searchParams;
  const access = await perfAccess({ user, workspace });
  const allowed = access.canSeePerson(who);
  const board = allowed ? await personBoard(workspace.id, config, access, who, rangeFromQuery(sp)) : null;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <PerfNav active="people" />
      {board ? (
        <PersonClient initial={board} me={user.name} />
      ) : (
        <EmptyState
          icon={allowed ? "person" : "lock"}
          title={allowed ? `Không có “${who}” trong danh sách nhân viên` : "Bạn không xem được hồ sơ này"}
          desc={allowed ? "Người được đo hiệu suất gồm đội trong cấu hình, tài khoản thành viên và thành viên các đội." : "Nhân viên chỉ xem hồ sơ hiệu suất của mình; trưởng nhóm xem được thành viên đội mình."}
          action={{ label: "Về tổng quan", href: "/w/perf/overview" }}
        />
      )}
    </div>
  );
}
