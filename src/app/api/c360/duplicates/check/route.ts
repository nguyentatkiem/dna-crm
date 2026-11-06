import { appApi, ok } from "@/lib/http";
import { recordScope } from "@/lib/permissions";
import { db } from "@/lib/db";
import { findDuplicatesFor } from "@/lib/c360/dupes";

/**
 * Cảnh báo "có thể trùng" cho form tạo/sửa khách: ?phone=&email=&name=&exclude=<id>.
 * Khách ngoài phạm vi xem của người dùng chỉ hiện tên người phụ trách, không lộ tên khách.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const q = new URL(req.url).searchParams;
  const hits = await findDuplicatesFor(a.ctx.workspace.id, { phone: q.get("phone") ?? "", email: q.get("email") ?? "", name: q.get("name") ?? "" }, a.ctx.config, q.get("exclude") || undefined);
  if (!hits.length) return ok({ matches: [] });
  const scope = await recordScope(a.ctx);
  const visible = new Set((await db.record.findMany({ where: { AND: [scope, { id: { in: hits.map((h) => h.id) } }] }, select: { id: true } })).map((r) => r.id));
  return ok({
    matches: hits.map((h) => (visible.has(h.id) ? { ...h, href: `/w/b/contacts?open=${h.id}` } : { id: "", title: "Một khách đã có", owner: h.owner, reason: h.reason })),
  });
}
