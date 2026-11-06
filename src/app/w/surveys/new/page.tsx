import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { canManageSurveys } from "@/lib/survey/api";
import { defaultQuestions } from "@/lib/survey/shared";
import { SurveyEditor } from "../SurveyEditor";

export default async function NewSurveyPage() {
  const ctx = await requireApp();
  if (!(await canManageSurveys(ctx))) redirect("/w/surveys");
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/surveys" className="text-[13px] text-ink-2 hover:underline">
        ← Khảo sát
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Khảo sát mới</h1>
      <SurveyEditor initial={{ name: "", kind: "nps", questions: defaultQuestions("nps"), thankYou: "Cảm ơn bạn đã góp ý!", active: true }} />
    </div>
  );
}
