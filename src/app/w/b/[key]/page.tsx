import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { toDTO } from "@/lib/records";
import { Board } from "@/components/board/Board";
import { can, getRole, recordScope } from "@/lib/permissions";
import { getPrivacy, maskRecord } from "@/lib/privacy";

export default async function BoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; open?: string }> }) {
  const { key } = await params;
  const { q, open } = await searchParams;
  const ctx = await requireApp();
  const { config } = ctx;
  const obj = getObject(config, key);
  if (!obj) notFound();
  const [role, prefs] = await Promise.all([getRole(ctx.user.id, ctx.workspace.id), getPrivacy(ctx.workspace.id)]);
  const rows = await db.record.findMany({
    where: { ...(await recordScope(ctx)), objectKey: key },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { activities: true } } },
  });
  return <Board key={key} obj={obj} team={config.team} initial={rows.map((r) => maskRecord(toDTO(r), obj, role, prefs))} initialQ={q ?? ""} initialOpen={open ?? null} canDelete={can(role, "delete")} canImport={can(role, "import")} canExport={can(role, "export")} />;
}
