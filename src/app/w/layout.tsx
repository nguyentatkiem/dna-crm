import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Copilot } from "@/components/Copilot";
import { INDUSTRIES } from "@/lib/dna";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, config } = await requireApp();
  const counts = await db.record.groupBy({ by: ["objectKey"], where: { workspaceId: workspace.id }, _count: true });
  const openTasks = await db.task.count({ where: { workspaceId: workspace.id, done: false } });
  const boards = config.objects.map((o) => ({ key: o.key, label: o.label, count: counts.find((c) => c.objectKey === o.key)?._count ?? 0 }));
  const industry = INDUSTRIES[config.industry as keyof typeof INDUSTRIES]?.label ?? "";

  return (
    <div className="flex h-screen flex-col">
      <Topbar workspace={workspace.name} user={user.name} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar workspace={workspace.name} industry={industry} boards={boards} openTasks={openTasks} />
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
      <Copilot term={config.terminology} />
    </div>
  );
}
