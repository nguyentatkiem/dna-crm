import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";

/** Xoá các mục được tạo từ dữ liệu mẫu (đánh dấu bằng hoạt động "Dữ liệu mẫu..."). */
export async function DELETE() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const marks = await db.activity.findMany({ where: { body: "Dữ liệu mẫu để bạn thử hệ thống", record: { workspaceId: wid } }, select: { recordId: true } });
  const ids = marks.map((m) => m.recordId);
  await db.task.deleteMany({ where: { workspaceId: wid, OR: [{ recordId: { in: ids } }, { recordId: null, source: { in: ["Care & Retention", "Sales Coach"] } }] } });
  const { count } = await db.record.deleteMany({ where: { id: { in: ids }, workspaceId: wid } });
  return ok({ deleted: count });
}
