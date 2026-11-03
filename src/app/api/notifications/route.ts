import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";

/** Chuông thông báo: việc quá hạn, việc hôm nay, hoạt động mới của agent và tự động hoá. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const start = new Date(new Date().toDateString());
  const end = new Date(start.getTime() + 864e5);
  const [tasks, logs] = await Promise.all([
    db.task.findMany({ where: { workspaceId: wid, done: false, dueAt: { lt: end } }, orderBy: { dueAt: "asc" }, take: 15 }),
    db.agentLog.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return ok([
    ...tasks.map((t) => ({ id: t.id, kind: t.dueAt! < start ? "overdue" : "today", text: t.title, at: t.dueAt!.toISOString(), href: "/w/my-work" })),
    ...logs.map((l) => ({ id: l.id, kind: "agent", text: `${l.agent}: ${l.message}`, at: l.createdAt.toISOString(), href: "/w/agents" })),
  ]);
}
