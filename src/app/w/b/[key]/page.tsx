import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { toDTO } from "@/lib/records";
import { Board } from "@/components/board/Board";

export default async function BoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; open?: string }> }) {
  const { key } = await params;
  const { q, open } = await searchParams;
  const { workspace, config } = await requireApp();
  const obj = getObject(config, key);
  if (!obj) notFound();
  const rows = await db.record.findMany({
    where: { workspaceId: workspace.id, objectKey: key },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { activities: true } } },
  });
  return <Board key={key} obj={obj} team={config.team} initial={rows.map(toDTO)} initialQ={q ?? ""} initialOpen={open ?? null} />;
}
