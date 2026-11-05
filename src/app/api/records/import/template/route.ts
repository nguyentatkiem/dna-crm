import { appApi, fail } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { buildXlsx, templateSheets, XLSX_MIME } from "@/lib/xlsx";

/** File mẫu .xlsx đúng các cột của bảng, kèm sheet hướng dẫn. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const key = new URL(req.url).searchParams.get("object") ?? "contacts";
  const obj = getObject(a.ctx.config, key);
  if (!obj) return fail("Không có bảng này", 404);
  const buf = await buildXlsx(templateSheets(obj));
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="mau-nhap-${key}.xlsx"` },
  });
}
