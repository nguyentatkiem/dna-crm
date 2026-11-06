import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { can, getRole, memberSeesOwnOnly, recordScope } from "@/lib/permissions";

/**
 * Nhật ký hoạt động của cả một bảng (tạo, sửa, xoá, nhập, xuất), mới nhất trước.
 * ?object=deals&take=100&before=<ISO> để tải thêm. Nhân viên bị giới hạn chỉ thấy nhật ký các mục mình được thấy.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const sp = new URL(req.url).searchParams;
  const obj = getObject(ctx.config, sp.get("object") ?? "");
  if (!obj) return fail("Không có bảng này", 404);
  const take = Math.min(200, Math.max(1, Number(sp.get("take")) || 100));
  const before = sp.get("before");

  let ids: string[] | null = null;
  if (memberSeesOwnOnly(ctx.workspace) && !can(await getRole(ctx.user.id, ctx.workspace.id), "see_all")) {
    const rows = await db.record.findMany({ where: { AND: [await recordScope(ctx), { objectKey: obj.key }] }, select: { id: true } });
    ids = rows.map((r) => r.id);
  }

  const rows = await db.auditLog.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      OR: [{ entity: obj.key, ...(ids ? { entityId: { in: ids } } : {}) }, ...(ids ? [] : [{ entity: "record", entityId: obj.key }])],
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return ok({
    entries: rows.map((r) => ({ id: r.id, action: r.action, entityId: r.entityId, userName: r.userName, summary: r.summary, createdAt: r.createdAt.toISOString() })),
    more: rows.length === take,
  });
}
