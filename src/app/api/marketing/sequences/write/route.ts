import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { writeStep } from "@/lib/marketing/sequences";
import type { MsgChannel } from "@/lib/marketing/shared";

const CH: MsgChannel[] = ["zalo", "zns", "sms", "email", "messenger"];

/** Nút "AI viết nội dung": Claude theo DNA/ngành, không có key thì dùng mẫu câu. */
export async function POST(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const { channel, purpose, stepIndex } = (await req.json().catch(() => ({}))) as { channel?: MsgChannel; purpose?: string; stepIndex?: number };
  if (!channel || !CH.includes(channel)) return fail("Kênh không hợp lệ");
  return ok(await writeStep(a.ctx.workspace.id, a.ctx.config, { channel, purpose: String(purpose ?? "").slice(0, 300), stepIndex: Number(stepIndex) || 0 }));
}
