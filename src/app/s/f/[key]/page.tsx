import type { Metadata } from "next";
import { db } from "@/lib/db";
import { questionsOf } from "@/lib/survey/service";
import { SurveyForm } from "@/components/survey/SurveyForm";
import { Invalid, SurveyShell } from "../../Shell";

export const metadata: Metadata = { title: "Khảo sát ý kiến", robots: { index: false } };

/** Link mở: ai có link cũng trả lời được (ẩn danh), dán lên fanpage, in mã QR tại quầy. */
export default async function OpenSurveyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = await db.survey.findUnique({ where: { publicKey: key }, include: { workspace: { select: { name: true } } } });
  if (!s || !s.active) return <Invalid />;
  return (
    <SurveyShell brand={s.workspace.name} title={s.name}>
      <p className="mt-1 text-[14px] text-ink-2">Chỉ mất chưa đến 1 phút. Cảm ơn bạn đã dành thời gian!</p>
      <SurveyForm questions={questionsOf(s)} endpoint={`/api/public/survey/f/${key}`} thankYou={s.thankYou} />
    </SurveyShell>
  );
}
