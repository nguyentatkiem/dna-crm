import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const tasks = await db.task.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: [{ done: "asc" }, { dueAt: "asc" }] });
  return ok(tasks);
}

const Body = z.object({ title: z.string().trim().min(1).max(300), recordId: z.string().optional(), dueAt: z.string().datetime().optional().nullable() });

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Hãy nhập tên việc");
  const { title, recordId, dueAt } = parsed.data;
  if (recordId && !(await db.record.findFirst({ where: { id: recordId, workspaceId: a.ctx.workspace.id } }))) return fail("Không tìm thấy mục", 404);
  const task = await db.task.create({ data: { workspaceId: a.ctx.workspace.id, title, recordId, dueAt: dueAt ? new Date(dueAt) : null, source: a.ctx.user.name } });
  return ok(task, 201);
}
