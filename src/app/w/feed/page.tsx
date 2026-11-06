import { requireApp } from "@/lib/auth";
import { allow, getAccess } from "@/lib/permissions";
import { listChannels, listPosts } from "@/lib/feed";
import { memberNames, teamOf } from "@/lib/kpi";
import { Feed } from "@/components/feed/Feed";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { user, workspace, config } = await requireApp();
  const [role, posts, channels, members] = await Promise.all([getAccess(user.id, workspace.id), listPosts(workspace.id), listChannels(workspace.id), memberNames(workspace.id)]);
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Feed initialPosts={posts} initialChannels={channels} me={user.name} manager={allow(role, "feed_moderate")} team={teamOf(config, members)} />
    </div>
  );
}
