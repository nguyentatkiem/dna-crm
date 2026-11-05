import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { getDocFor } from "@/lib/docs";
import { DocPage } from "../DocsClient";

export default async function DocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireApp();
  const found = await getDocFor(ctx, id);
  if (!found) notFound();
  return (
    <div className="canvas px-2 pb-16 pt-4 sm:px-8">
      <a href="/w/docs" className="btn-ghost mb-3 text-ink-2">
        ← Tất cả tài liệu
      </a>
      <div className="mx-auto max-w-[900px]">
        <DocPage id={id} />
      </div>
    </div>
  );
}
