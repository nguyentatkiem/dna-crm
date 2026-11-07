import { requireApp } from "@/lib/auth";
import { KbClient } from "./KbClient";

export const metadata = { title: "Kho kiến thức" };

export default async function KbPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireApp();
  const { tab } = await searchParams;
  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <KbClient initialTab={tab ?? "faq"} />
    </div>
  );
}
