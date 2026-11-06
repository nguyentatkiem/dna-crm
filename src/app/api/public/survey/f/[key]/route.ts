import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/marketing/landing";
import { cleanAnswers } from "@/lib/survey/shared";
import { questionsOf, submitOpen } from "@/lib/survey/service";

type P = { params: Promise<{ key: string }> };

/** Câu trả lời từ link mở (ẩn danh). Cùng một IP chỉ nhận 1 lần mỗi phút cho mỗi khảo sát. */
export async function POST(req: Request, { params }: P) {
  const { key } = await params;
  const s = await db.survey.findUnique({ where: { publicKey: key } });
  if (!s || !s.active) return fail("Khảo sát không còn nhận câu trả lời", 404);
  const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, unknown> };
  const c = cleanAnswers(questionsOf(s), body.answers ?? {});
  if ("error" in c) return fail(c.error);
  if (!rateLimit(`survey|${clientIp(req)}|${key}`, 1, 60_000)) return fail("Bạn vừa gửi rồi, vui lòng chờ một phút nếu muốn gửi thêm", 429);
  return ok(await submitOpen(s, c));
}
