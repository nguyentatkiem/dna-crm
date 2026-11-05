import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseWidgets } from "@/lib/dashboards";
import { DashboardList } from "./DashboardList";

export default async function DashboardsPage() {
  const { workspace } = await requireApp();
  const rows = await db.dashboard.findMany({ where: { workspaceId: workspace.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return (
    <DashboardList
      initial={rows.map((d) => {
        const widgets = parseWidgets(d.widgetsJson);
        return { id: d.id, name: d.name, isDefault: d.isDefault, widgets: widgets.length, types: [...new Set(widgets.map((w) => w.type))].slice(0, 6), updatedAt: d.updatedAt.toISOString() };
      })}
    />
  );
}
