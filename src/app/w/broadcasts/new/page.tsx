import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { channelReady } from "@/lib/marketing/messaging";
import { B_CHANNELS } from "@/lib/marketing/broadcast";
import { Icon } from "@/components/Icon";
import { Composer } from "../Composer";

export default async function NewBroadcastPage({ searchParams }: { searchParams: Promise<{ segment?: string }> }) {
  const { segment } = await searchParams;
  const { user, workspace } = await requireApp();
  if (!allow(await getAccess(user.id, workspace.id), "broadcast_send")) redirect("/w/broadcasts");
  const segments = await db.segment.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const s = getSettings(workspace);
  const notReady = Object.fromEntries(B_CHANNELS.map((c) => [c, channelReady(s, c)]));
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/broadcasts" className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
        <Icon name="chevron" size={14} className="rotate-90" /> Gửi hàng loạt
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Tạo đợt gửi</h1>
      <Composer segments={segments} notReady={notReady} initialSegmentId={segments.some((x) => x.id === segment) ? segment : undefined} />
    </div>
  );
}
