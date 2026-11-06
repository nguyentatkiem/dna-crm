import { appApi, fail, ok } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";
import { mmeLinks, saveMmeLinks } from "@/lib/fb/admin";

type P = { params: Promise<{ id: string }> };

/** Xoá link (hội thoại đã ghi nguồn vẫn giữ). */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await accessOf(a.ctx), "inbox_settings")) return fail("Bạn không có quyền xoá link", 403);
  const id = (await params).id;
  const links = await mmeLinks(a.ctx.workspace.id);
  if (!links.some((l) => l.id === id)) return fail("Không tìm thấy link", 404);
  await saveMmeLinks(a.ctx.workspace.id, links.filter((l) => l.id !== id));
  return ok({ ok: true });
}
