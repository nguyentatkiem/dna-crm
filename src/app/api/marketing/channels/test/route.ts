import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { sendMessage, type Channel } from "@/lib/marketing/messaging";

/** "Gửi thử" tới số/email chủ nhập. Tôn trọng MESSAGING_DRY_RUN; chưa cấu hình thì trả bỏ qua, không gọi mạng. */
export async function POST(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { channel, to, body } = (await req.json().catch(() => ({}))) as { channel?: Channel; to?: string; body?: string };
  if (!channel || !["zns", "sms", "email"].includes(channel)) return fail("Kênh không hợp lệ");
  if (!to?.trim()) return fail(channel === "email" ? "Nhập email nhận thử" : "Nhập số điện thoại nhận thử");
  const r = await sendMessage(a.ctx.workspace.id, { channel, to: to.trim(), subject: "Tin thử từ CRM", body: body?.trim() || `Tin thử từ ${a.ctx.config.businessName}: kênh gửi đã hoạt động.` });
  return ok(r);
}
