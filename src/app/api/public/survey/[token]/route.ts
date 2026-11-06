import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { cleanAnswers } from "@/lib/survey/shared";
import { questionsOf, submitInvite } from "@/lib/survey/service";

type P = { params: Promise<{ token: string }> };

/** Khách gửi câu trả lời qua link cá nhân (công khai). Mỗi link nhận một lần. */
export async function POST(req: Request, { params }: P) {
  const { token } = await params;
  const r = await db.surveyResponse.findUnique({ where: { token }, include: { survey: true } });
  if (!r || !r.survey.active) return fail("Khảo sát không còn nhận câu trả lời", 404);
  if (r.submittedAt) return fail("Bạn đã gửi câu trả lời rồi. Cảm ơn bạn!", 409);
  const body = (await req.json().catch(() => ({}))) as { answers?: Record<string, unknown> };
  const c = cleanAnswers(questionsOf(r.survey), body.answers ?? {});
  if ("error" in c) return fail(c.error);
  const res = await submitInvite(token, c);
  if (!res.ok) return fail(res.error, res.status);
  return ok(res);
}
