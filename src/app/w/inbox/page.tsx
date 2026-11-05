import { headers } from "next/headers";
import { requireApp } from "@/lib/auth";
import { listConversations } from "@/lib/inbox";
import { ensureHookKey, getSettings } from "@/lib/settings";
import { Inbox } from "./Inbox";

export const metadata = { title: "Hộp thư · DNA CRM" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { user, workspace, config } = await requireApp();
  const [initial, hookKey] = await Promise.all([listConversations({ user, workspace }, { filter: "all" }), ensureHookKey(workspace)]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const s = getSettings(workspace);
  return (
    <Inbox
      me={user.name}
      team={config.team}
      contactLabel={config.terminology.contact}
      initial={initial}
      initialId={c ?? null}
      setup={{
        zaloUrl: `${origin}/api/hooks/${hookKey}/zalo`,
        fbUrl: `${origin}/api/hooks/${hookKey}/facebook`,
        zalo: !!s.zalo?.accessToken || !!s.zalo?.refreshToken,
        messenger: !!s.facebook?.pageToken,
      }}
    />
  );
}
