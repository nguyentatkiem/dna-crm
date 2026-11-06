import { notFound } from "next/navigation";
import { requireApp } from "@/lib/auth";
import { db } from "@/lib/db";
import { getObject } from "@/lib/config/schema";
import { toDTO } from "@/lib/records";
import { Board } from "@/components/board/Board";
import { accessOf, allow, recordScope } from "@/lib/permissions";
import { getPrivacy, maskRecord } from "@/lib/privacy";
import { getPref } from "@/lib/prefs";
import { applyFieldAccess, getFieldRules, readonlyKeys, visibleObject } from "@/lib/field-access";
import type { FormLayoutPref } from "@/lib/form-layout";

export default async function BoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; open?: string }> }) {
  const { key } = await params;
  const { q, open } = await searchParams;
  const ctx = await requireApp();
  const { config } = ctx;
  const full = getObject(config, key);
  if (!full) notFound();
  const [acc, prefs, rules, layouts] = await Promise.all([accessOf(ctx), getPrivacy(ctx.workspace.id), getFieldRules(ctx.workspace.id, key), getPref<FormLayoutPref>(ctx.workspace.id, "formLayout", {})]);
  const role = acc.base;
  // Phân quyền theo trường: trường ẩn không gửi xuống trình duyệt (không cột, không lọc, không form); trường chỉ xem không sửa được.
  const obj = visibleObject(full, role, rules);
  const rows = await db.record.findMany({
    where: { ...(await recordScope(ctx)), objectKey: key },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { activities: true } } },
  });
  return (
    <Board
      key={key}
      obj={obj}
      team={config.team}
      initial={rows.map((r) => applyFieldAccess(maskRecord(toDTO(r), full, role, prefs), role, rules))}
      initialQ={q ?? ""}
      initialOpen={open ?? null}
      canDelete={allow(acc, "record_delete")}
      canImport={allow(acc, "record_import")}
      canExport={allow(acc, "record_export")}
      canBulk={allow(acc, "record_bulk_edit")}
      canAssign={allow(acc, "record_assign")}
      readOnly={readonlyKeys(role, rules)}
      formLayout={layouts[key] ?? null}
    />
  );
}
