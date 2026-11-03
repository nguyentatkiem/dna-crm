import { redirect } from "next/navigation";
import { getContext } from "@/lib/auth";
import { db, parseJson } from "@/lib/db";
import { defaultDna, type Dna } from "@/lib/dna";
import { Wizard } from "./Wizard";

export default async function OnboardingPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const last = await db.dna.findFirst({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" } });
  const dna = parseJson<Dna>(last?.dataJson, defaultDna("spa"));
  return <Wizard initial={dna} isEdit={ctx.workspace.onboarded} userName={ctx.user.name} />;
}
