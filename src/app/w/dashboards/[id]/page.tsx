import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseWidgets } from "@/lib/dashboards";
import { computeDashboard } from "@/lib/widgets";
import { CHANNELS } from "@/lib/sources/ingest";
import { DashboardView } from "../DashboardView";

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const ctx = await requireApp();
  const { id } = await params;
  const { edit } = await searchParams;
  const wid = ctx.workspace.id;
  const [d, all, members] = await Promise.all([
    db.dashboard.findFirst({ where: { id, workspaceId: wid } }),
    db.dashboard.findMany({ where: { workspaceId: wid }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, isDefault: true } }),
    db.membership.findMany({ where: { workspaceId: wid }, select: { user: { select: { name: true } } } }),
  ]);
  if (!d) notFound();
  const widgets = parseWidgets(d.widgetsJson);
  const data = await computeDashboard(ctx, ctx.config, widgets);
  const team = [...new Set([...ctx.config.team, ...members.map((m) => m.user.name)])].filter(Boolean);
  return (
    <DashboardView
      key={d.id}
      dashboard={{ id: d.id, name: d.name, isDefault: d.isDefault }}
      others={all}
      initialWidgets={widgets}
      initialData={data}
      startEditing={edit === "1"}
      options={{ objects: ctx.config.objects.map((o) => ({ key: o.key, label: o.label })), team, channels: Object.entries(CHANNELS).map(([key, label]) => ({ key, label })) }}
    />
  );
}
