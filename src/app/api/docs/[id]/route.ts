import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { docToText, getDocFor, parseDoc, toDocDTO, type PMNode } from "@/lib/docs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const found = await getDocFor(a.ctx, id);
  if (!found) return fail("Không tìm thấy tài liệu", 404);
  return ok({ ...toDocDTO(found.doc, found.rec), contentJson: parseDoc(found.doc.contentJson) });
}

const Patch = z.object({
  title: z.string().max(200).optional(),
  contentJson: z.object({ type: z.literal("doc") }).passthrough().optional(),
  contentText: z.string().max(200_000).optional(),
});

/** Lưu tự động từ trình soạn thảo (debounce phía client). */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const found = await getDocFor(a.ctx, id);
  if (!found) return fail("Không tìm thấy tài liệu", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const p = parsed.data;
  const json = p.contentJson ? JSON.stringify(p.contentJson) : undefined;
  if (json && json.length > 2_000_000) return fail("Tài liệu quá lớn (tối đa khoảng 2 MB)");
  const text = p.contentJson ? (p.contentText ?? docToText(p.contentJson as unknown as PMNode)).slice(0, 200_000) : undefined;
  const d = await db.doc.update({
    where: { id },
    data: { title: p.title?.trim() || undefined, contentJson: json, contentText: text, updatedBy: a.ctx.user.name },
  });
  return ok(toDocDTO(d, found.rec));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const found = await getDocFor(a.ctx, id);
  if (!found) return fail("Không tìm thấy tài liệu", 404);
  await db.doc.delete({ where: { id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "doc", id, `Xoá tài liệu “${found.doc.title}”${found.rec ? ` của ${found.rec.title}` : ""}`, { title: found.doc.title, recordId: found.doc.recordId, contentText: found.doc.contentText.slice(0, 2000) });
  return ok({ deleted: true });
}
