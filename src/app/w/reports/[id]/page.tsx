import { notFound, redirect } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { canManageReports, findVisibleReport, memberNames, toDTO } from "@/lib/reports/service";
import { reportTemplates } from "@/lib/reports/templates";
import { blankConfig, DATASETS, type DatasetKey } from "@/lib/reports/shared";
import { emailReady } from "@/lib/reports/mail";
import { accessOf, allow } from "@/lib/permissions";
import { builderMeta } from "../meta";
import { ReportBuilder } from "../ReportBuilder";

export const metadata = { title: "Báo cáo" };

/** /w/reports/new?template=…&dataset=… tạo bản nháp; /w/reports/<id> mở báo cáo đã lưu. */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string; dataset?: string }> }) {
  const ctx = await requireApp();
  const { id } = await params;
  const sp = await searchParams;
  const manage = await canManageReports(ctx);
  const acc = await accessOf(ctx);
  const canExport = manage || allow(acc, "record_export");
  const meta = builderMeta(ctx.config);
  const mailOk = await emailReady(ctx.workspace.id);
  const me = { name: ctx.user.name, email: ctx.user.email };

  if (id === "new") {
    if (!manage) redirect("/w/reports");
    const t = sp.template ? reportTemplates(ctx.config).find((x) => x.key === sp.template) : undefined;
    const ds = DATASETS.includes(sp.dataset as DatasetKey) ? (sp.dataset as DatasetKey) : "orders";
    return <ReportBuilder meta={meta} me={me} mailOk={mailOk} canExport={canExport} initial={{ id: null, name: t?.name ?? "Báo cáo mới", config: t?.config ?? blankConfig(ds), schedule: { freq: "off", hour: 8, weekday: 1, day: 1 }, recipients: [], shared: false, canEdit: true, lastSentAt: null, owner: ctx.user.name }} />;
  }

  const r = await findVisibleReport(ctx, id);
  if (!r) notFound();
  const { names } = await memberNames(ctx.workspace.id);
  const d = await toDTO(ctx, r, ctx.config, names);
  return (
    <ReportBuilder
      meta={meta}
      me={me}
      mailOk={mailOk}
      canExport={canExport}
      initial={{ id: d.id, name: d.name, config: d.config ?? blankConfig(), broken: !d.config, schedule: d.schedule, recipients: d.recipients, shared: d.shared, canEdit: d.canEdit, lastSentAt: d.lastSentAt, owner: d.createdByName }}
    />
  );
}
