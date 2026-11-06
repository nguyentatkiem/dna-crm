import { db } from "@/lib/db";
import { appApi } from "@/lib/http";
import { getQuickTopics } from "@/lib/inbox-list";
import { quickToCsv } from "@/lib/quick-replies";
import { toQuickDTO } from "../shared";

/** Xuất mẫu: ?format=json (mặc định) | csv. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const [rows, topics] = await Promise.all([db.quickReply.findMany({ where: { workspaceId: wid }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }), getQuickTopics(wid)]);
  const items = rows.map(toQuickDTO);
  const day = new Date().toISOString().slice(0, 10);
  if (format === "csv")
    return new Response(quickToCsv(items, topics), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mau-tra-loi-nhanh-${day}.csv"` } });
  const body = { topics, items: items.map((r) => ({ shortcut: r.shortcut, topic: topics.find((t) => t.key === r.topic)?.name ?? r.topic, content: r.content, attachments: r.attachments })) };
  return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="mau-tra-loi-nhanh-${day}.json"` } });
}
