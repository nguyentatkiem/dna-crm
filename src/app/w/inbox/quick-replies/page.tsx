import { requireApp } from "@/lib/auth";
import { getInboxTags } from "@/lib/inbox-list";
import { accessOf, allow } from "@/lib/permissions";
import { docScope } from "@/lib/sales/access";
import { QuickRepliesManager } from "@/components/inbox/QuickRepliesManager";

export const metadata = { title: "Trả lời nhanh · Hộp thư · DNA CRM" };

/** Quản lý mẫu trả lời nhanh, chủ đề và thẻ hội thoại. Ai cũng xem/dùng được; sửa cần quyền quick_reply_manage. */
export default async function QuickRepliesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const ctx = await requireApp();
  const [acc, tags, sales] = await Promise.all([accessOf(ctx), getInboxTags(ctx.workspace.id), docScope(ctx)]);
  return (
    <QuickRepliesManager
      me={ctx.user.name}
      initialTab={tab === "tags" || tab === "topics" ? tab : "replies"}
      initialTags={tags}
      perms={{
        assign: allow(acc, "inbox_assign"),
        moderate: allow(acc, "comment_moderate"),
        manageQuick: allow(acc, "quick_reply_manage"),
        salesCreate: sales.perm.create,
        stats: allow(acc, "inbox_stats"),
        settings: allow(acc, "inbox_settings"),
        quality: allow(acc, "inbox_stats") || allow(acc, "inbox_view_all"),
        rescore: acc.isOwner || acc.base === "owner" || acc.base === "manager",
      }}
    />
  );
}
