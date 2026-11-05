import { appApi, ok } from "@/lib/http";
import { listConversations } from "@/lib/inbox";

/** Danh sách hội thoại: ?filter=all|unread|mine|done&channel=zalo|messenger&q=... */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const u = new URL(req.url).searchParams;
  return ok(await listConversations(a.ctx, { filter: u.get("filter") ?? "all", channel: u.get("channel") ?? "", q: u.get("q") ?? "" }));
}
