import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allowed } from "@/lib/permissions";

const Body = z.object({ ids: z.array(z.string().max(60)).max(2000) });

/** Sắp xếp lại mẫu (kéo thả): ids theo thứ tự mới. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "quick_reply_manage"))) return fail("Bạn chưa có quyền sắp xếp mẫu", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dữ liệu không hợp lệ");
  const wid = a.ctx.workspace.id;
  await db.$transaction(p.data.ids.map((id, i) => db.quickReply.updateMany({ where: { id, workspaceId: wid }, data: { sort: i + 1 } })));
  return ok({ ok: true });
}
