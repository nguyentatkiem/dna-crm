import { db, parseJson } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { getObject, type ObjectDef } from "@/lib/config/schema";
import { toCsv } from "@/lib/csv";
import { can, getRole, recordScope } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { buildXlsx, recordsSheet, XLSX_MIME, type Cell } from "@/lib/xlsx";

/**
 * Xuất bảng ra Excel (.xlsx, mặc định) hoặc CSV.
 * ?object=contacts|deals|appointments|all (all = mỗi bảng một sheet, chỉ .xlsx) · ?format=xlsx|csv
 * Chỉ xuất những mục người dùng được thấy (recordScope).
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  if (!can(await getRole(ctx.user.id, ctx.workspace.id), "export")) return fail("Bạn không có quyền xuất dữ liệu. Hãy nhờ chủ hoặc quản lý.", 403);

  const sp = new URL(req.url).searchParams;
  const key = sp.get("object") ?? "contacts";
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";
  const objs: ObjectDef[] = key === "all" ? ctx.config.objects : [getObject(ctx.config, key)].filter((o): o is ObjectDef => !!o);
  if (!objs.length) return fail("Không có bảng này", 404);
  if (format === "csv" && objs.length > 1) return fail("CSV chỉ xuất được một bảng. Chọn ?format=xlsx để xuất tất cả.");

  const scope = await recordScope(ctx);
  const sheets = await Promise.all(
    objs.map(async (obj) => {
      const rows = await db.record.findMany({ where: { ...scope, objectKey: obj.key }, orderBy: { createdAt: "asc" } });
      return recordsSheet(
        obj,
        rows.map((r) => ({ ...r, data: parseJson<Record<string, string | number>>(r.dataJson, {}) })),
      );
    }),
  );
  const total = sheets.reduce((s, x) => s + x.rows.length, 0);
  const date = new Date().toISOString().slice(0, 10);
  const name = key === "all" ? "crm" : key;
  await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "export", "record", key, `Xuất ${total} mục (${objs.map((o) => o.label).join(", ")}) ra ${format.toUpperCase()}`);

  if (format === "csv") {
    const s = sheets[0];
    const cell = (v: Cell) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? ""));
    return new Response(toCsv([s.columns.map((c) => c.header), ...s.rows.map((r) => r.map(cell))]), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${date}.csv"` },
    });
  }
  const buf = await buildXlsx(sheets);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="${name}-${date}.xlsx"`, "Cache-Control": "no-store" },
  });
}
