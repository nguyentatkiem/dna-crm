import { db, parseJson } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const key = new URL(req.url).searchParams.get("object") ?? "contacts";
  const obj = getObject(a.ctx.config, key);
  if (!obj) return fail("Không có bảng này", 404);
  const rows = await db.record.findMany({ where: { workspaceId: a.ctx.workspace.id, objectKey: key }, orderBy: { createdAt: "asc" } });
  const header = [obj.itemLabel, obj.statusLabel, "Phụ trách", ...obj.fields.map((f) => f.label), ...(obj.amountLabel ? [obj.amountLabel] : []), ...(key === "contacts" ? ["Điểm AI"] : []), "Ngày tạo"];
  const body = rows.map((r) => {
    const d = parseJson<Record<string, string | number>>(r.dataJson, {});
    return [
      r.title,
      obj.statuses.find((s) => s.key === r.status)?.label ?? r.status,
      r.ownerName,
      ...obj.fields.map((f) => d[f.key] ?? ""),
      ...(obj.amountLabel ? [r.amount] : []),
      ...(key === "contacts" ? [r.score] : []),
      r.createdAt.toISOString().slice(0, 10),
    ];
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${key}-${date}.csv"`,
    },
  });
}
