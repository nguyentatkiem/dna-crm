import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findScopedRecord, recordScope } from "@/lib/permissions";
import { contactFields, customerOf } from "@/lib/sales/customers";
import { fold } from "@/lib/sales/shared";

/**
 * Tìm khách hoặc giao dịch để gắn vào báo giá/đơn/hợp đồng (trong phạm vi được xem).
 * ?object=contacts|deals&q=...  hoặc ?customerOf=<recordId> để lấy khách của một giao dịch.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const of = sp.get("customerOf");
  if (of) {
    const rec = await findScopedRecord(a.ctx, of);
    if (!rec) return fail("Không tìm thấy mục", 404);
    return ok({ customer: await customerOf(a.ctx.workspace.id, a.ctx.config, rec) });
  }
  const object = sp.get("object") === "deals" ? "deals" : "contacts";
  const q = fold(sp.get("q")?.trim() ?? "");
  const rows = await db.record.findMany({ where: { AND: [await recordScope(a.ctx), { objectKey: object }] }, orderBy: { updatedAt: "desc" }, take: 1000 });
  const hit = rows.filter((r) => {
    if (!q) return true;
    const f = contactFields(a.ctx.config, r);
    return fold(`${r.title} ${f.phone} ${f.email}`).includes(q);
  });
  const items = hit.slice(0, 20).map((r) => {
    const f = contactFields(a.ctx.config, r);
    let lienHe = "";
    try {
      lienHe = String((JSON.parse(r.dataJson) as Record<string, unknown>)._lien_he ?? "");
    } catch {}
    return { id: r.id, title: r.title, status: r.status, amount: r.amount, ownerName: r.ownerName, phone: object === "contacts" ? f.phone : "", email: object === "contacts" ? f.email : "", contactId: lienHe || null };
  });
  return ok({ items });
}
