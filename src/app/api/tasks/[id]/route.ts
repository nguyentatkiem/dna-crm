import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const { done } = (await req.json().catch(() => ({}))) as { done?: boolean };
  const { count } = await db.task.updateMany({ where: { id, workspaceId: a.ctx.workspace.id }, data: { done: !!done } });
  if (!count) return fail("Không tìm thấy việc", 404);
  return ok({ id, done: !!done });
}
