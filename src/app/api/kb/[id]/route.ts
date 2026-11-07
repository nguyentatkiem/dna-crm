import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canManageKb } from "@/lib/kb/api";
import { invalidateKb, kbDTO } from "@/lib/kb/store";
import { parseTags } from "@/lib/kb/text";

const Patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  content: z.string().trim().min(1).max(100_000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  active: z.boolean().optional(),
  kind: z.enum(["faq", "doc", "policy", "conversation"]).optional(),
});

type P = { params: Promise<{ id: string }> };

/** Sửa / bật-tắt một mục. Mục sản phẩm chỉ được bật/tắt (nội dung đồng bộ từ bảng Sản phẩm). */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const doc = await db.kbDoc.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!doc) return fail("Không tìm thấy mục", 404);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const d = p.data;
  const data = doc.kind === "product" ? { active: d.active ?? doc.active } : { title: d.title, content: d.content, active: d.active, kind: d.kind, tagsJson: d.tags !== undefined ? JSON.stringify(parseTags(d.tags)) : undefined };
  const next = await db.kbDoc.update({ where: { id: doc.id }, data });
  invalidateKb(a.ctx.workspace.id);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.update", "kb", doc.id, `Sửa mục kho: ${next.title.slice(0, 80)}`);
  return ok({ item: kbDTO(next) });
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const doc = await db.kbDoc.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!doc) return fail("Không tìm thấy mục", 404);
  if (doc.kind === "product") return fail("Mục sản phẩm đồng bộ tự động — hãy tắt thay vì xoá");
  await db.kbDoc.delete({ where: { id: doc.id } });
  invalidateKb(a.ctx.workspace.id);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.delete", "kb", doc.id, `Xoá mục kho: ${doc.title.slice(0, 80)}`);
  return ok({ ok: true });
}
