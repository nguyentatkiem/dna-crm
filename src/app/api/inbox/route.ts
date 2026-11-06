import { appApi, ok } from "@/lib/http";
import { listInbox } from "@/lib/inbox-list";
import { parseInboxQuery } from "@/lib/inbox-query";

/**
 * Danh sách hội thoại theo bộ lọc nâng cao (xem parseInboxQuery trong src/lib/inbox-query.ts):
 * ?kind=inbox|comment&page=&channel=&status=open|done|all&read=unread|unreplied|read_unreplied&sort=newest|oldest_wait
 * &phone=has|none&tags=a,b&tagMode=any|all&notTags=&assignees=Lan,-&source=post|ad|website|ref&post=<postId>
 * &dateField=created|updated&from=YYYY-MM-DD&to=&privateReplied=no|yes&orderMarked=1&live=live|notlive&q=&limit=
 * Vẫn nhận tham số cũ ?filter=all|unread|mine|done.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const q = parseInboxQuery(new URL(req.url).searchParams, a.ctx.user.name);
  return ok(await listInbox(a.ctx, q));
}
