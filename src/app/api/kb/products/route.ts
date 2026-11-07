import { appApi, fail, ok } from "@/lib/http";
import { canManageKb } from "@/lib/kb/api";
import { syncProducts } from "@/lib/kb/store";

/** Đồng bộ ngay bảng Sản phẩm vào kho (GET danh sách tab Sản phẩm cũng tự đồng bộ). */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageKb(a.ctx))) return fail("Bạn chưa có quyền sửa kho kiến thức", 403);
  return ok(await syncProducts(a.ctx.workspace.id));
}
