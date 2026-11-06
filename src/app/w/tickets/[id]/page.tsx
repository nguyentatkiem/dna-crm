import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { findTicket } from "@/lib/care/server";
import { can, getRole } from "@/lib/permissions";
import { Icon } from "@/components/Icon";
import { listTeams } from "@/lib/perf/teams";
import { routingPref } from "@/lib/perf/server";
import { TicketDetail } from "./TicketDetail";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, workspace, config } = await requireApp();
  const { id } = await params;
  const t = await findTicket({ user, workspace }, id);
  if (!t) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="ticket" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Không tìm thấy phiếu hoặc bạn không có quyền xem</p>
        <Link href="/w/tickets" className="btn-outline mt-4">
          Về danh sách phiếu
        </Link>
      </div>
    );
  }
  const [canDelete, teams, routing] = await Promise.all([getRole(user.id, workspace.id).then((r) => can(r, "delete")), listTeams(workspace.id), routingPref(workspace.id)]);
  return (
    <div className="canvas px-4 pb-16 pt-5 sm:px-8">
      <TicketDetail id={t.id} team={config.team} me={user.name} canDelete={canDelete} teams={teams.map((x) => ({ id: x.id, name: x.name, color: x.color }))} categories={routing.categories} />
    </div>
  );
}
