import { db } from "@/lib/db";
import { MME_PREF, mmeUrl, type MmeLink } from "@/lib/fb/admin";
import { parseJson } from "@/lib/db";

type P = { params: Promise<{ code: string }> };

// Công khai (không cần đăng nhập): khách bấm link rút gọn → đếm lượt → chuyển sang m.me/<trang>?ref=<ref>.
export async function GET(_req: Request, { params }: P) {
  const code = (await params).code;
  if (!/^[\w-]{4,20}$/.test(code)) return new Response("Không tìm thấy", { status: 404 });
  // Mã ngắn duy nhất trên mọi workspace (ngẫu nhiên 40 bit): tìm Pref chứa mã.
  const rows = await db.pref.findMany({ where: { key: MME_PREF, valueJson: { contains: `"code":"${code}"` } }, take: 2 });
  for (const row of rows) {
    const v = parseJson<{ links: MmeLink[] }>(row.valueJson, { links: [] });
    const link = v.links?.find((l) => l.code === code);
    if (!link) continue;
    link.clicks = (link.clicks ?? 0) + 1;
    await db.pref.update({ where: { workspaceId_key: { workspaceId: row.workspaceId, key: MME_PREF } }, data: { valueJson: JSON.stringify(v) } }).catch(() => {});
    return Response.redirect(mmeUrl(link.pageId, link.ref), 302);
  }
  return new Response("Link không tồn tại hoặc đã bị xoá", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
