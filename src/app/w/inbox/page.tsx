import { headers } from "next/headers";
import { requireApp } from "@/lib/auth";
import { getObject } from "@/lib/config/schema";
import { db } from "@/lib/db";
import { getInboxTags, listInbox, listPages } from "@/lib/inbox-list";
import { parseInboxQuery } from "@/lib/inbox-query";
import { accessOf, allow } from "@/lib/permissions";
import { docScope } from "@/lib/sales/access";
import { ensureHookKey, getSettings } from "@/lib/settings";
import { Inbox } from "./Inbox";

export const metadata = { title: "Hộp thư · DNA CRM" };

type SP = Record<string, string | string[] | undefined>;

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = await searchParams;
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : Array.isArray(v) && v[0] ? [[k, v[0]]] : [])));
  const ctx = await requireApp();
  const { user, workspace, config } = ctx;
  const query = parseInboxQuery(sp, user.name);
  // Mở thẳng một bài viết (?post=) thì xem cả hội thoại đã xong của bài đó.
  if (query.post && !sp.get("status")) query.status = "all";
  const [initial, hookKey, pages, tags, acc, sales, posts, channelRows] = await Promise.all([
    listInbox(ctx, query),
    ensureHookKey(workspace),
    listPages(workspace.id),
    getInboxTags(workspace.id),
    accessOf(ctx),
    docScope(ctx),
    db.fbPost.findMany({ where: { workspaceId: workspace.id }, orderBy: { postedAt: "desc" }, take: 60, select: { postId: true, message: true, live: true, postedAt: true } }),
    db.conversation.groupBy({ by: ["channel"], where: { workspaceId: workspace.id } }),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const s = getSettings(workspace);
  const contacts = getObject(config, "contacts");
  const deals = getObject(config, "deals");
  const appts = getObject(config, "appointments");
  return (
    <Inbox
      me={user.name}
      team={config.team}
      businessName={config.businessName}
      labels={{ contact: config.terminology.contact, deal: deals?.itemLabel || config.terminology.deal, appointment: appts?.itemLabel || config.terminology.appointment }}
      statuses={(contacts?.statuses ?? []).map((x) => ({ key: x.key, label: x.label, color: x.color }))}
      hasDeals={!!deals}
      hasAppointments={!!appts && config.modules.appointments}
      initial={initial}
      initialQuery={query}
      initialId={sp.get("c") || null}
      pages={pages}
      tags={tags}
      posts={posts.map((p) => ({ postId: p.postId, live: p.live, label: `${p.postedAt.toLocaleDateString("vi-VN")} · ${(p.message || "(không có nội dung)").replace(/\s+/g, " ").slice(0, 60)}` }))}
      channels={channelRows.map((c) => c.channel)}
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
      setup={{
        zaloUrl: `${origin}/api/hooks/${hookKey}/zalo`,
        fbUrl: `${origin}/api/hooks/${hookKey}/facebook`,
        zalo: !!s.zalo?.accessToken || !!s.zalo?.refreshToken,
        messenger: !!s.facebook?.pageToken,
      }}
    />
  );
}
