import Link from "next/link";
import { requireApp } from "@/lib/auth";
import { SurveyReportView } from "./SurveyReportView";

export default async function SurveyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ response?: string }> }) {
  await requireApp();
  const { id } = await params;
  const { response } = await searchParams;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <Link href="/w/surveys" className="text-[13px] text-ink-2 hover:underline">
        ← Khảo sát
      </Link>
      <SurveyReportView id={id} focus={response ?? ""} />
    </div>
  );
}
