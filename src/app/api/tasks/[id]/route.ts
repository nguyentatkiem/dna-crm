import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { can, findScopedRecord, getRole } from "@/lib/permissions";
import { notify, userIdByName } from "@/lib/notify";

const Body = z.object({ done: z.boolean().optional(), assignee: z.string().max(100).optional() });

/** Đánh dấu xong / giao lại việc. Nhân viên chỉ sửa được việc mình nhìn thấy. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const role = await getRole(a.ctx.user.id, a.ctx.workspace.id);
  const task = await db.task.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!task) return fail("Không tìm thấy việc", 404);
  if (!can(role, "see_all")) {
    // Nhân viên: việc giao cho mình, hoặc việc gắn với mục mình được xem, hoặc việc chung chưa giao.
    const allowed = task.assignee === a.ctx.user.name || (task.recordId ? !!(await findScopedRecord(a.ctx, task.recordId)) : !task.assignee);
    if (!allowed) return fail("Không tìm thấy việc", 404);
  }
  const { done, assignee } = parsed.data;
  if (assignee !== undefined && assignee && assignee !== a.ctx.user.name && !a.ctx.config.team.includes(assignee)) return fail("Người được giao không có trong đội");
  const updated = await db.task.update({ where: { id }, data: { done: done === undefined ? undefined : done, assignee: assignee === undefined ? undefined : assignee.trim() } });
  if (assignee && assignee !== task.assignee && assignee !== a.ctx.user.name) {
    const userId = await userIdByName(a.ctx.workspace.id, assignee);
    if (userId) await notify(a.ctx.workspace.id, { userId, kind: "task", text: `${a.ctx.user.name} giao cho bạn việc “${task.title}”`, href: `/w/my-work?task=${id}` });
  }
  return ok(updated);
}
