// Ngữ cảnh chung cho các trang server của Bán hàng.
import { requireApp } from "@/lib/auth";
import { getObject } from "@/lib/config/schema";
import { db } from "@/lib/db";
import { findScopedRecord } from "@/lib/permissions";
import { docScope } from "./access";
import { customerOf } from "./customers";

export async function salesPage() {
  const ctx = await requireApp();
  const scope = await docScope(ctx);
  const deals = getObject(ctx.config, "deals");
  return { ...ctx, scope, dealLabel: deals?.itemLabel || "Giao dịch" };
}

/** Sản phẩm đang bán cho ô chọn dòng hàng. */
export const activeProducts = (workspaceId: string) =>
  db.product.findMany({ where: { workspaceId, active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true, unit: true, category: true, price: true, vat: true } });

/** Bản nháp ban đầu cho trình soạn, điền sẵn khách/giao dịch khi mở từ một record (?record=id). */
export async function draftFromRecord(ctx: Awaited<ReturnType<typeof salesPage>>, recordId?: string) {
  const blank = { contactId: null as string | null, contactTitle: "", recordId: null as string | null, recordTitle: "", customerName: "", customerPhone: "", customerEmail: "" };
  if (!recordId) return blank;
  const rec = await findScopedRecord(ctx, recordId);
  if (!rec) return blank;
  const c = await customerOf(ctx.workspace.id, ctx.config, rec);
  return { contactId: c.contactId, contactTitle: c.contactId ? c.name : "", recordId: c.recordId, recordTitle: c.recordId ? rec.title : "", customerName: c.name, customerPhone: c.phone, customerEmail: c.email };
}
