import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { testBot } from "@/lib/kb/bot";
import { BotPrefSchema } from "@/lib/kb/shared";

const Body = z.object({
  question: z.string().trim().min(1, "Nhập câu hỏi thử").max(1000),
  channel: z.string().max(30).optional(),
  inWorkingHours: z.boolean().optional(),
  pref: BotPrefSchema.partial().optional(),
});

/** Sân thử: bot sẽ trả lời gì (không gửi cho ai). Ai cũng thử được; cài đặt chưa lưu truyền qua pref. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  return ok(await testBot(a.ctx.workspace.id, p.data.question, p.data));
}
