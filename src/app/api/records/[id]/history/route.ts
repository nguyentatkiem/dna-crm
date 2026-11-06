import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findScopedRecord } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

/** Lịch sử thay đổi từng ô của một mục (lấy từ nhật ký thao tác), mới nhất trước. */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  if (!(await findScopedRecord(a.ctx, id))) return fail("Không tìm thấy mục", 404);
  const rows = await db.auditLog.findMany({
    where: { workspaceId: a.ctx.workspace.id, entityId: id, action: { in: ["record.create", "record.update"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok({
    entries: rows.map((r) => {
      let diff: unknown = null;
      try {
        diff = r.diffJson ? JSON.parse(r.diffJson) : null;
      } catch {}
      return { id: r.id, action: r.action, userName: r.userName, summary: r.summary, createdAt: r.createdAt.toISOString(), diff };
    }),
  });
}
