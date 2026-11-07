import { db, parseJson } from "@/lib/db";
import { appApi } from "@/lib/http";
import { toCsv } from "@/lib/csv";
import { FAQ_CSV_HEADER } from "@/lib/kb/shared";

/** Xuất câu hỏi thường gặp ra CSV (mở được bằng Excel). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rows = await db.kbDoc.findMany({ where: { workspaceId: a.ctx.workspace.id, kind: { in: ["faq", "conversation"] } }, orderBy: { createdAt: "asc" } });
  const csv = toCsv([FAQ_CSV_HEADER, ...rows.map((r) => [r.title, r.content, parseJson<string[]>(r.tagsJson, []).join(", ")])]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cau-hoi-thuong-gap.csv"` } });
}
