import { requireApp } from "@/lib/auth";
import { SurveysClient } from "./SurveysClient";

export default async function SurveysPage() {
  await requireApp();
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <SurveysClient />
    </div>
  );
}
