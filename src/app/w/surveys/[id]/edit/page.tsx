import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireApp } from "@/lib/auth";
import { canManageSurveys } from "@/lib/survey/api";
import { questionsOf } from "@/lib/survey/service";
import type { SurveyKind } from "@/lib/survey/shared";
import { SurveyEditor } from "../../SurveyEditor";

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApp();
  const { id } = await params;
  if (!(await canManageSurveys(ctx))) redirect(`/w/surveys/${id}`);
  const s = await db.survey.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!s) notFound();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href={`/w/surveys/${id}`} className="text-[13px] text-ink-2 hover:underline">
        ← {s.name}
      </Link>
      <h1 className="mt-1 text-[26px] font-semibold">Sửa khảo sát</h1>
      <SurveyEditor id={id} initial={{ name: s.name, kind: s.kind as SurveyKind, questions: questionsOf(s), thankYou: s.thankYou, active: s.active }} />
    </div>
  );
}
