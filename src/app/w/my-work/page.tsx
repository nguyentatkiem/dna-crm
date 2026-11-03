import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { MyWork } from "./MyWork";

export default async function MyWorkPage() {
  const { workspace } = await requireApp();
  const tasks = await db.task.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
  const recIds = [...new Set(tasks.map((t) => t.recordId).filter((x): x is string => !!x))];
  const recs = await db.record.findMany({ where: { id: { in: recIds } }, select: { id: true, title: true, objectKey: true } });
  return (
    <MyWork
      initial={tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, source: t.source, dueAt: t.dueAt?.toISOString() ?? null, record: recs.find((r) => r.id === t.recordId) ?? null }))}
    />
  );
}
