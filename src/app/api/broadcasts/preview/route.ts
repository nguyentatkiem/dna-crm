import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { originOf, previewBroadcast, rememberOrigin, type Draft } from "@/lib/marketing/broadcast";
import { DraftIn } from "../schema";

/** Đếm người nhận (sẽ gửi / thiếu địa chỉ / đã huỷ / trùng) và dựng tin mẫu cho khách đầu tiên. */
export async function POST(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const p = DraftIn.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  await rememberOrigin(a.ctx.workspace.id, originOf(req)).catch(() => undefined);
  return ok(await previewBroadcast(a.ctx.workspace.id, a.ctx.config, p.data as Draft));
}
