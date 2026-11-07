import { appApi, fail, ok } from "@/lib/http";
import { canManageKb } from "@/lib/kb/api";
import { seedKb } from "@/lib/kb/seed";

/** Nạp bộ câu hỏi mẫu theo ngành (không tạo trùng). */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  return ok(await seedKb(a.ctx.workspace.id));
}
