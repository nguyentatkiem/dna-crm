import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findScopedRecord, taskScope } from "@/lib/permissions";
import { notify, userIdByName } from "@/lib/notify";

/** ?who=mine (mặc định) | all | <tên> — nhân viên luôn chỉ thấy việc của mình. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const who = new URL(req.url).searchParams.get("who") ?? "mine";
  const tasks = await db.task.findMany({ where: await taskScope(a.ctx, who), orderBy: [{ done: "asc" }, { dueAt: "asc" }] });
  return ok(tasks);
}

const Body = z.object({
  title: z.string().trim().min(1).max(300),
  recordId: z.string().optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assignee: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Hãy nhập tên việc");
  const { title, recordId, dueAt } = parsed.data;
  const assignee = parsed.data.assignee?.trim() ?? "";
  if (assignee && assignee !== a.ctx.user.name && !a.ctx.config.team.includes(assignee)) return fail("Người được giao không có trong đội");
  if (recordId && !(await findScopedRecord(a.ctx, recordId))) return fail("Không tìm thấy mục", 404);
  const task = await db.task.create({ data: { workspaceId: a.ctx.workspace.id, title, recordId, assignee, dueAt: dueAt ? new Date(dueAt) : null, source: a.ctx.user.name } });
  if (assignee && assignee !== a.ctx.user.name) {
    const userId = await userIdByName(a.ctx.workspace.id, assignee);
    if (userId) await notify(a.ctx.workspace.id, { userId, kind: "task", text: `${a.ctx.user.name} giao cho bạn việc “${title}”`, href: `/w/my-work?task=${task.id}` });
  }
  return ok(task, 201);
}
