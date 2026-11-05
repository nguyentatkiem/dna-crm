import { db } from "@/lib/db";
import { isOwner } from "@/lib/auth";
import { appApi, fail, ok } from "@/lib/http";
import { applyLesson } from "@/lib/calls";

/** Chủ duyệt (apply) hoặc bỏ qua (dismiss) một bài học. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!(await isOwner(a.ctx.user.id, wid))) return fail("Chỉ chủ workspace được duyệt bài học", 403);
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "apply") {
    await applyLesson(wid, id);
    await db.agentLog.create({ data: { workspaceId: wid, agent: "Vòng phản hồi", message: "Đã áp dụng bài học, phiếu chấm lên phiên bản mới" } });
  } else await db.lesson.updateMany({ where: { id, workspaceId: wid }, data: { status: "dismissed" } });
  return ok({ ok: true });
}
