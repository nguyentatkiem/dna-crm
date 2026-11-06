import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { FbError, fetchRecentPosts, isDryRun } from "@/lib/fb/graph";

const Body = z.object({ pageId: z.string().optional() });

/** Tải 25 bài mới nhất của mỗi trang đang bật từ Facebook (nội dung, ảnh, link, loại, số bình luận). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "inbox_settings")) return fail("Bạn không có quyền đồng bộ bài viết", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  const wid = a.ctx.workspace.id;
  const pages = await db.fbPage.findMany({ where: { workspaceId: wid, active: true, ...(p.success && p.data.pageId ? { pageId: p.data.pageId } : {}) } });
  if (!pages.length) return fail("Chưa có trang nào đang bật. Kết nối trang ở Hộp thư → Trang.");
  let synced = 0;
  const errors: string[] = [];
  const simulated: string[] = [];
  for (const page of pages) {
    if (isDryRun(page.token)) {
      simulated.push(page.name);
      continue;
    }
    try {
      for (const info of await fetchRecentPosts(page.token, page.pageId)) {
        await db.fbPost.upsert({
          where: { workspaceId_postId: { workspaceId: wid, postId: info.postId } },
          create: { workspaceId: wid, pageId: page.pageId, postId: info.postId, message: info.message, image: info.image, permalink: info.permalink, kind: info.kind, live: info.live, postedAt: info.postedAt ?? new Date(), commentsCount: info.commentsCount },
          update: { message: info.message, image: info.image, permalink: info.permalink, kind: info.kind, live: info.live, ...(info.postedAt ? { postedAt: info.postedAt } : {}) },
        });
        synced++;
      }
    } catch (e) {
      errors.push(`${page.name}: ${e instanceof FbError ? e.message : "lỗi không rõ"}`);
    }
  }
  return ok({ synced, errors, simulated, note: simulated.length ? `Trang chạy thử (token mẫu / MESSAGING_DRY_RUN=1) không tải từ Facebook: ${simulated.join(", ")}` : "" });
}
