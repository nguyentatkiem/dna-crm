import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function own(id: string, wid: string) {
  return db.record.findFirst({ where: { id, workspaceId: wid }, select: { id: true } });
}

export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  if (!(await own(id, a.ctx.workspace.id))) return fail("Không tìm thấy mục", 404);
  const [activities, tasks] = await Promise.all([
    db.activity.findMany({ where: { recordId: id }, orderBy: { createdAt: "desc" } }),
    db.task.findMany({ where: { recordId: id }, orderBy: { createdAt: "desc" } }),
  ]);
  return ok({ activities, tasks });
}

export async function POST(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  if (!(await own(id, a.ctx.workspace.id))) return fail("Không tìm thấy mục", 404);
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  if (!body?.trim()) return fail("Hãy viết nội dung cập nhật");
  const act = await db.activity.create({ data: { recordId: id, kind: "update", body: body.trim().slice(0, 4000), author: a.ctx.user.name } });
  await db.record.update({ where: { id }, data: { updatedAt: new Date() } });
  return ok(act, 201);
}
