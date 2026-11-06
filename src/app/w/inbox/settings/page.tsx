import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import { allowed } from "@/lib/permissions";
import { listTeams } from "@/lib/perf/teams";
import { loadAssignPref, staffNames } from "@/lib/chat/assign";
import { presenceList } from "@/lib/chat/presence";
import { InboxSettingsClient } from "./InboxSettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cài đặt hộp thư · DNA CRM" };

export default async function InboxSettingsPage() {
  const { user, workspace } = await requireApp();
  if (!(await allowed({ user, workspace }, "inbox_settings"))) {
    return (
      <div className="canvas grid place-items-center px-4 py-20 text-center">
        <Icon name="lock" size={32} className="text-ink-2" />
        <p className="mt-3 font-semibold">Bạn chưa có quyền cài đặt hộp thư</p>
        <p className="mt-1 text-ink-2">Nhờ chủ hoặc quản lý bật quyền “Cài đặt hộp thư” cho vai trò của bạn.</p>
        <Link href="/w/inbox" className="btn-outline mt-4">
          Về Hộp thư
        </Link>
      </div>
    );
  }
  const wid = workspace.id;
  const [pref, staff, teams, presence] = await Promise.all([loadAssignPref(wid), staffNames(wid), listTeams(wid), presenceList(wid)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <Link href="/w/inbox" className="hover:underline">
          ← Hộp thư
        </Link>
        <Link href="/w/inbox/stats" className="hover:underline">
          Thống kê hộp thư →
        </Link>
      </div>
      <h1 className="mt-1 text-[26px] font-semibold">Cài đặt hộp thư</h1>
      <p className="mt-1 max-w-3xl text-ink-2">Chia hội thoại cho nhân viên, giờ làm việc để tính thời gian phản hồi, và ai được xem hội thoại nào.</p>
      <InboxSettingsClient initial={pref} staff={staff} teams={teams} initialPresence={presence} />
    </div>
  );
}
