import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  const { count } = await db.automation.updateMany({ where: { id, workspaceId: a.ctx.workspace.id }, data: { enabled: !!enabled } });
  return count ? ok({ id, enabled: !!enabled }) : fail("Không tìm thấy công thức", 404);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const { count } = await db.automation.deleteMany({ where: { id, workspaceId: a.ctx.workspace.id } });
  return count ? ok({ deleted: true }) : fail("Không tìm thấy công thức", 404);
}
