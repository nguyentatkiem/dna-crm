import type { Metadata } from "next";
import { db } from "@/lib/db";
import { questionsOf } from "@/lib/survey/service";
import { SurveyForm } from "@/components/survey/SurveyForm";
import { Invalid, SurveyShell } from "../Shell";

export const metadata: Metadata = { title: "Khảo sát ý kiến", robots: { index: false } };

/** Link khảo sát cá nhân: mỗi link trả lời một lần. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await db.surveyResponse.findUnique({ where: { token }, include: { survey: { include: { workspace: { select: { name: true } } } } } });
  if (!r || !r.survey.active) return <Invalid />;
  const rec = r.recordId ? await db.record.findFirst({ where: { id: r.recordId }, select: { title: true } }) : null;
  const first = rec?.title.trim().split(/\s+/).pop();
  return (
    <SurveyShell brand={r.survey.workspace.name} title={first ? `Chào ${first}, bạn thấy thế nào?` : r.survey.name}>
      <p className="mt-1 text-[14px] text-ink-2">Chỉ mất chưa đến 1 phút. Cảm ơn bạn đã dành thời gian!</p>
      <SurveyForm questions={questionsOf(r.survey)} endpoint={`/api/public/survey/${token}`} thankYou={r.survey.thankYou} done={!!r.submittedAt} />
    </SurveyShell>
  );
}
