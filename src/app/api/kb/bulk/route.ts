import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canManageKb, createDocs, DocInput } from "@/lib/kb/api";
import { maskPII } from "@/lib/kb/text";

const Body = z.object({ items: z.array(DocInput).min(1).max(200) });

/** Lưu nhiều mục một lần (cặp hỏi–đáp đã duyệt từ hội thoại). Nội dung được che SĐT/email lần nữa cho chắc. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const items = p.data.items.map((d) => ({ ...d, title: maskPII(d.title), content: maskPII(d.content), source: d.source?.startsWith("inbox:") ? d.source : (d.source ?? "manual") }));
  const n = await createDocs(a.ctx, items);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.bulk", "kb", "", `Thêm ${n} mục vào kho kiến thức`);
  return ok({ created: n });
}
