import { z } from "zod";
import { parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { allow, getAccess, getRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getFieldRules, hiddenKeys, readonlyKeys } from "@/lib/field-access";
import { importRows, mapRows, MAX_ROWS, readUpload } from "./lib";
import { viMessage } from "@/lib/format";

const Row = z.object({
  title: z.string(),
  status: z.string().optional(),
  ownerName: z.string().optional(),
  amount: z.number().optional(),
  data: z.record(z.string(), z.union([z.string(), z.number()])),
});
const Body = z.object({ objectKey: z.string(), rows: z.array(Row).max(MAX_ROWS) });

/**
 * Nhập hàng loạt. Hai cách gửi:
 * - JSON { objectKey, rows } (dữ liệu dán từ Excel / CSV đọc ở trình duyệt).
 * - multipart: file (.xlsx/.csv) + objectKey + map (JSON mảng khoá trường theo thứ tự cột) — sau bước xem trước.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const role = await getRole(ctx.user.id, ctx.workspace.id);
  if (!allow(await getAccess(ctx.user.id, ctx.workspace.id), "record_import")) return fail("Bạn chưa có quyền nhập dữ liệu. Hãy nhờ chủ workspace cấp quyền.", 403);

  let objectKey = "";
  let rows: z.infer<typeof Row>[] = [];
  let source = "dán/CSV";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return fail("Chưa chọn file");
    objectKey = String(form?.get("objectKey") ?? "");
    const obj = getObject(ctx.config, objectKey);
    if (!obj) return fail("Không có bảng này", 404);
    const map = z.array(z.string()).safeParse(parseJson<unknown>(String(form?.get("map") ?? ""), null));
    if (!map.success || !map.data.includes("__title")) return fail("Cần chọn cột nào là tên");
    try {
      const table = await readUpload(file);
      if (table.length - 1 > MAX_ROWS) return fail(`File có ${table.length - 1} dòng, tối đa ${MAX_ROWS} dòng mỗi lần nhập.`);
      rows = mapRows(obj, table, map.data);
    } catch (e) {
      return fail(viMessage(e, "Không đọc được file"));
    }
    source = file.name;
  } else {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return fail("Dữ liệu nhập không hợp lệ");
    ({ objectKey, rows } = parsed.data);
  }
  const obj = getObject(ctx.config, objectKey);
  if (!obj) return fail("Không có bảng này", 404);
  // Phân quyền trường: bỏ cột bị ẩn với vai trò này; cột chỉ xem chỉ được điền khi tạo mới, không gộp vào khách đã có.
  const rules = await getFieldRules(ctx.workspace.id, objectKey);
  const hide = hiddenKeys(role, rules);
  if (hide.size) rows = rows.map((r) => ({ ...r, data: Object.fromEntries(Object.entries(r.data).filter(([k]) => !hide.has(k))) }));
  const res = await importRows(ctx, obj, rows, new Set(readonlyKeys(role, rules)));
  await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "import", "record", objectKey, `Nhập ${obj.label} từ ${source}: tạo ${res.created}, gộp ${res.merged}, bỏ qua ${res.skipped}`, res);
  return ok(res);
}
