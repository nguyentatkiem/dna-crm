import { ok } from "@/lib/http";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Khoá VAPID công khai cho trình duyệt đăng ký. Rỗng = chưa bật thông báo đẩy. */
export async function GET() {
  return ok({ key: pushConfigured() ? vapidPublicKey() : "" });
}
