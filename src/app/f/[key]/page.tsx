import { notFound } from "next/navigation";
import { db, parseJson } from "@/lib/db";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { LeadForm } from "./LeadForm";

export default async function PublicFormPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ws = await db.workspace.findUnique({ where: { formKey: key } });
  if (!ws) notFound();
  const row = await db.workspaceConfig.findFirst({ where: { workspaceId: ws.id, isActive: true } });
  const cfg = parseJson<WorkspaceConfig | null>(row?.configJson, null);
  const obj = cfg && getObject(cfg, "contacts");
  if (!obj) notFound();
  const selects = obj.fields.filter((f) => f.type === "select" && f.key !== "nguon").slice(0, 2).map((f) => ({ key: f.key, label: f.label, options: f.options.map((o) => o.label) }));

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-[460px] rounded-xl bg-surface p-6 shadow-card sm:p-8">
        <p className="label">{ws.name}</p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight">Để lại thông tin, chúng tôi sẽ liên hệ ngay</h1>
        <p className="mt-1 text-[14px] text-ink-2">Thông tin của bạn chỉ dùng để tư vấn.</p>
        <LeadForm formKey={key} selects={selects} />
      </div>
    </main>
  );
}
