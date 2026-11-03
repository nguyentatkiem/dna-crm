import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import type { AutomationDef } from "@/lib/config/schema";
import { Automations } from "./Automations";

export default async function AutomationsPage() {
  const { workspace, config } = await requireApp();
  const rows = await db.automation.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } });
  return <Automations config={config} initial={rows.map((r) => ({ ...r, ...(r as unknown as AutomationDef), createdAt: r.createdAt.toISOString() }))} />;
}
