import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { MAX_ROWS, readUpload } from "../lib";
import { viMessage } from "@/lib/format";

/** Bước 1 khi nhập file: đọc file ở server (.xlsx hoặc .csv), trả tiêu đề cột + 10 dòng đầu + tổng số dòng. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!allow(await getAccess(a.ctx.user.id, a.ctx.workspace.id), "record_import")) return fail("Bạn chưa có quyền nhập dữ liệu. Hãy nhờ chủ workspace cấp quyền.", 403);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Chưa chọn file");
  try {
    const table = await readUpload(file);
    if (table.length < 2) return fail("File cần ít nhất một dòng tiêu đề và một dòng dữ liệu.");
    const total = table.length - 1;
    if (total > MAX_ROWS) return fail(`File có ${total} dòng, tối đa ${MAX_ROWS} dòng mỗi lần nhập. Hãy chia nhỏ file.`);
    return ok({ header: table[0], sample: table.slice(1, 11), total, name: file.name });
  } catch (e) {
    return fail(viMessage(e, "Không đọc được file"));
  }
}
