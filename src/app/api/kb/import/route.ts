import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { parseTable } from "@/lib/csv";
import { canManageKb, createDocs } from "@/lib/kb/api";
import { rowsToFaq } from "@/lib/kb/shared";

const Body = z.object({ text: z.string().min(1, "File trống").max(2_000_000) });

/** Nhập câu hỏi thường gặp từ CSV / dán từ Excel (cột Câu hỏi, Trả lời, Thẻ). Bỏ qua câu hỏi đã có. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const rows = rowsToFaq(parseTable(p.data.text)).slice(0, 2000);
  if (!rows.length) return fail("Không đọc được dòng nào. Cần 2 cột: Câu hỏi, Trả lời (thêm cột Thẻ nếu muốn).");
  const have = new Set((await db.kbDoc.findMany({ where: { workspaceId: a.ctx.workspace.id, kind: "faq" }, select: { title: true } })).map((d) => d.title.trim().toLowerCase()));
  // Bỏ câu đã có trong kho và câu lặp lại ngay trong file (giữ dòng đầu tiên, không phân biệt hoa thường).
  const fresh = rows.filter((r) => {
    const k = r.title.trim().toLowerCase();
    if (!k || have.has(k)) return false;
    have.add(k);
    return true;
  });
  await createDocs(a.ctx, fresh.map((r) => ({ kind: "faq" as const, title: r.title, content: r.content, tags: r.tags, source: "import" })));
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "kb.import", "kb", "", `Nhập ${fresh.length} câu hỏi thường gặp từ CSV`);
  return ok({ created: fresh.length, skipped: rows.length - fresh.length });
}
