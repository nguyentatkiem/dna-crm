import { appApi, ok } from "@/lib/http";
import { searchMessages, workspaceMembers } from "@/lib/teamchat/server";

/** Tìm tin nhắn trong các hội thoại mình tham gia. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  const members = await workspaceMembers(a.ctx.workspace.id);
  return ok({ items: await searchMessages(a.ctx, q, new Map(members.map((m) => [m.id, m.name]))) });
}
