import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageReports, memberNames, toDTO, visibleReportsWhere } from "@/lib/reports/service";
import { reportTemplates } from "@/lib/reports/templates";
import { datasetLabel } from "@/lib/reports/shared";
import { ReportList } from "./ReportList";

export const metadata = { title: "Báo cáo tự tạo" };

export default async function ReportsPage() {
  const ctx = await requireApp();
  const rows = await db.report.findMany({ where: visibleReportsWhere(ctx), orderBy: { updatedAt: "desc" }, take: 300 });
  const { names } = await memberNames(ctx.workspace.id);
  const items = await Promise.all(rows.map((r) => toDTO(ctx, r, ctx.config, names)));
  const templates = reportTemplates(ctx.config).map((t) => ({ key: t.key, name: t.name, description: t.description, icon: t.icon, dataset: datasetLabel(t.config.dataset, ctx.config) }));
  return (
    <ReportList
      initial={items.map((r) => ({ id: r.id, name: r.name, dataset: r.config ? datasetLabel(r.config.dataset, ctx.config) : "—", chart: r.config?.chart ?? "table", shared: r.shared, mine: r.mine, canEdit: r.canEdit, owner: r.createdByName, schedule: r.schedule.freq === "off" ? "" : r.scheduleLabel, updatedAt: r.updatedAt }))}
      templates={templates}
      canManage={await canManageReports(ctx)}
    />
  );
}
