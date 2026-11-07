import { appApi, fail } from "@/lib/http";
import { accessOf, allow } from "@/lib/permissions";

/** Cần quyền "Kiểm tra kết nối & nhật ký lỗi" (health_view). */
export async function healthApi() {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const acc = await accessOf(a.ctx);
  if (!allow(acc, "health_view")) return { error: fail("Bạn chưa có quyền xem trang Kiểm tra kết nối", 403) } as const;
  return { ctx: a.ctx, acc } as const;
}
