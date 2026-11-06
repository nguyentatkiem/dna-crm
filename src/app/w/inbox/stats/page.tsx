import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { allowed } from "@/lib/permissions";
import { inboxStats } from "@/lib/chat/stats";
import { InboxStatsClient } from "./InboxStatsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thống kê hộp thư · DNA CRM" };

export default async function InboxStatsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const { user, workspace } = await requireApp();
  const [initial, canSettings] = await Promise.all([inboxStats({ user, workspace }, { range: sp.range ?? "7d", from: sp.from, to: sp.to }), allowed({ user, workspace }, "inbox_settings")]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <Link href="/w/inbox" className="hover:underline">
          ← Hộp thư
        </Link>
        {canSettings && (
          <Link href="/w/inbox/settings" className="hover:underline">
            Cài đặt hộp thư →
          </Link>
        )}
      </div>
      <h1 className="mt-1 text-[26px] font-semibold">{initial.full ? "Thống kê hộp thư" : "Thống kê hộp thư của bạn"}</h1>
      <p className="mt-1 max-w-3xl text-ink-2">
        {initial.full ? "Tin nhắn, bình luận, SĐT thu được và tốc độ phản hồi theo trang, nhân viên và thẻ." : "Số liệu các hội thoại bạn phụ trách hoặc đã trả lời."} Thời gian phản hồi chỉ tính trong giờ làm việc.
      </p>
      <InboxStatsClient initial={initial} />
    </div>
  );
}
