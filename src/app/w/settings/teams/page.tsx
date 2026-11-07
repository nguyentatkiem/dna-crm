import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { knownPeople, listTeams } from "@/lib/perf/teams";
import { routingPref } from "@/lib/perf/server";
import { allowed } from "@/lib/permissions";
import { TeamsClient } from "./TeamsClient";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const { user, workspace, config } = await requireApp();
  if (!(await allowed({ user, workspace }, "teams_manage"))) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Chỉ chủ và quản lý sửa được phòng ban / đội</p>
        <Link href="/w/settings" className="btn-outline mt-4">
          Về Cài đặt
        </Link>
      </div>
    );
  }
  const [teams, people, routing] = await Promise.all([listTeams(workspace.id), knownPeople(workspace.id, config.team), routingPref(workspace.id)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/settings" className="text-[13px] text-ink-2 hover:underline">
        ← Cài đặt
      </Link>
      <h1 data-tour="teams-head" className="mt-1 text-[26px] font-semibold">Phòng ban / đội</h1>
      <p className="mt-1 text-ink-2">Nhóm nhân viên theo đội để đặt KPI theo đội, thưởng trưởng nhóm, và phân luồng phiếu hỗ trợ về đúng bộ phận.</p>
      <TeamsClient initialTeams={teams} people={people} initialRouting={routing} />
    </div>
  );
}
