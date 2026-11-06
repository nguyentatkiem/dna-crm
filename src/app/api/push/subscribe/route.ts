import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { pushConfigured, removeSubscription, saveSubscription, sendPushToUser } from "@/lib/push";

const Sub = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
  test: z.boolean().optional(),
});

/** Lưu đăng ký Web Push của trình duyệt này. test = true thì gửi thử một thông báo. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!pushConfigured()) return fail("Máy chủ chưa cấu hình thông báo đẩy (VAPID)", 409);
  const p = Sub.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Đăng ký không hợp lệ");
  await saveSubscription(a.ctx.workspace.id, a.ctx.user.id, p.data);
  if (p.data.test) await sendPushToUser(a.ctx.workspace.id, a.ctx.user.id, { title: "DNA CRM", body: "Đã bật thông báo trên thiết bị này ✅", url: "/w" });
  return ok({ ok: true }, 201);
}

const Del = z.object({ endpoint: z.string().max(2000) });

/** Huỷ đăng ký của trình duyệt này. */
export async function DELETE(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Del.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Thiếu endpoint");
  await removeSubscription(a.ctx.user.id, p.data.endpoint);
  return ok({ ok: true });
}
