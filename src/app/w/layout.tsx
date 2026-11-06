import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Copilot } from "@/components/Copilot";
import { CommandPalette } from "@/components/CommandPalette";
import { Toaster } from "@/components/ui/Toast";
import { INDUSTRIES } from "@/lib/dna";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, config } = await requireApp();
  // Máy chủ dev chạy từ trước khi generate Prisma có thể chưa có bảng Conversation: không để cả app lỗi theo.
  const conv = db.conversation as typeof db.conversation | undefined;
  const [counts, openTasks, inbox] = await Promise.all([
    db.record.groupBy({ by: ["objectKey"], where: { workspaceId: workspace.id }, _count: true }),
    db.task.count({ where: { workspaceId: workspace.id, done: false } }),
    conv ? conv.aggregate({ where: { workspaceId: workspace.id }, _sum: { unread: true } }).catch(() => ({ _sum: { unread: 0 } })) : { _sum: { unread: 0 } },
  ]);
  const boards = config.objects.map((o) => ({ key: o.key, label: o.label, count: counts.find((c) => c.objectKey === o.key)?._count ?? 0 }));
  const industry = INDUSTRIES[config.industry as keyof typeof INDUSTRIES]?.label ?? "";
  const unread = inbox._sum.unread ?? 0;

  return (
    <div className="flex h-[100dvh] flex-col">
      <Topbar workspace={workspace.name} user={user.name} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar workspace={workspace.name} industry={industry} boards={boards} openTasks={openTasks} unread={unread} />
        <main id="main" className="min-w-0 flex-1 overflow-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>
      <Copilot term={config.terminology} />
      <CommandPalette boards={boards} term={config.terminology} />
      <Toaster />
    </div>
  );
}
