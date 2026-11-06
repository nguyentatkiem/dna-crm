import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { sendTest, type Draft } from "@/lib/marketing/broadcast";
import { DraftIn, contentError } from "../schema";

const In = DraftIn.extend({ to: z.string().trim().min(1, "Hãy nhập địa chỉ nhận thử").max(200) });

/** Gửi thử một tin tới địa chỉ người dùng tự nhập. Trả rõ lý do khi kênh chưa cấu hình. */
export async function POST(req: Request) {
  const a = await marketingApi("broadcast_send");
  if ("error" in a) return a.error;
  const p = In.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const err = contentError(p.data);
  if (err) return fail(err);
  const r = await sendTest(a.ctx.workspace.id, a.ctx.config, p.data as Draft, p.data.to);
  return ok(r);
}
