import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { allow, getAccess, taskScope } from "@/lib/permissions";
import { MyWork } from "./MyWork";

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ who?: string; task?: string }> }) {
  const ctx = await requireApp();
  const { workspace, user, config } = ctx;
  const sp = await searchParams;
  const acc = await getAccess(user.id, workspace.id);
  const seeAll = allow(acc, "task_view_others");
  const who = seeAll ? (sp.who ?? "mine") : "mine";
  const tasks = await db.task.findMany({ where: await taskScope(ctx, who), orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
  const recIds = [...new Set(tasks.map((t) => t.recordId).filter((x): x is string => !!x))];
  const recs = await db.record.findMany({ where: { id: { in: recIds } }, select: { id: true, title: true, objectKey: true } });
  const team = [...new Set([user.name, ...config.team])];
  return (
    <MyWork
      key={who}
      me={user.name}
      team={team}
      who={who}
      canSeeAll={seeAll}
      highlight={sp.task ?? null}
      initial={tasks.map((t) => ({ id: t.id, title: t.title, done: t.done, source: t.source, assignee: t.assignee, dueAt: t.dueAt?.toISOString() ?? null, record: recs.find((r) => r.id === t.recordId) ?? null }))}
    />
  );
}
