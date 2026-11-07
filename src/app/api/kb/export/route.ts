import { db, parseJson } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { allowed } from "@/lib/permissions";
import { toCsv } from "@/lib/csv";
import { FAQ_CSV_HEADER } from "@/lib/kb/shared";

/** Xuất câu hỏi thường gặp ra CSV (mở được bằng Excel). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await allowed(a.ctx, "kb_manage")) && !(await allowed(a.ctx, "record_export"))) return fail("Bạn chưa có quyền xuất kho kiến thức", 403);
  const rows = await db.kbDoc.findMany({ where: { workspaceId: a.ctx.workspace.id, kind: { in: ["faq", "conversation"] } }, orderBy: { createdAt: "asc" } });
  const csv = toCsv([FAQ_CSV_HEADER, ...rows.map((r) => [r.title, r.content, parseJson<string[]>(r.tagsJson, []).join(", ")])]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cau-hoi-thuong-gap.csv"` } });
}
