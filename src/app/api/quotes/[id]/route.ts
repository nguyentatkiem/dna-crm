import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { canEditDoc, docScope, notifyManagers, scoped, resolveLinks } from "@/lib/sales/access";
import { totals } from "@/lib/sales/lines";
import { QuoteInput, firstError } from "@/lib/sales/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  const quote = await db.quote.findFirst({ where: scoped(s.where, { id }) });
  if (!quote) return fail("Không tìm thấy báo giá", 404);
  return ok(quote);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  const before = await db.quote.findFirst({ where: scoped(s.where, { id }) });
  if (!before) return fail("Không tìm thấy báo giá", 404);
  if (!canEditDoc(a.ctx, s.seeAll, before)) return fail("Chỉ người tạo hoặc người có quyền “Sửa chứng từ của người khác” được sửa báo giá này", 403);
  if (before.status === "accepted" || before.orderId) return fail("Báo giá đã chốt thành đơn, không sửa được nữa. Hãy nhân bản để làm báo giá mới.", 409);
  const p = QuoteInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const links = await resolveLinks(a.ctx, d);
  const t = totals(d.items, d.discount);
  // Nhân viên sửa báo giá đã duyệt/đã gửi thì phải duyệt lại; quản lý sửa giữ nguyên trạng thái.
  let status = before.status;
  if (d.intent === "submit") status = s.perm.approve ? "approved" : "pending";
  else if (!s.perm.approve && before.status !== "draft") status = "draft";
  else if (before.status === "rejected" || before.status === "expired") status = "draft";
  const data = {
    ...links,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    customerEmail: d.customerEmail,
    title: d.title,
    status,
    itemsJson: JSON.stringify(d.items),
    ...t,
    validUntil: d.validUntil === undefined ? before.validUntil : d.validUntil,
    note: d.note,
    terms: d.terms,
    ...(status === "approved" && before.status !== "approved" ? { approvedBy: a.ctx.user.name, approvedAt: new Date(), rejectReason: "" } : {}),
    ...(status === "draft" && before.status !== "draft" ? { approvedBy: "", approvedAt: null } : {}),
  };
  const quote = await db.quote.update({ where: { id }, data });
  const diff = diffOf(before as unknown as Record<string, unknown>, { ...data, approvedAt: undefined, validUntil: undefined });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "quote.update", "quote", id, `Sửa báo giá ${quote.number}: ${Object.keys(diff).join(", ") || "không đổi"}`, diff);
  if (status === "pending" && before.status !== "pending") await notifyManagers(a.ctx.workspace.id, id, `${a.ctx.user.name} gửi duyệt báo giá ${quote.number} (${quote.customerName})`);
  return ok(quote);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  if (!s.perm.del) return fail("Bạn chưa có quyền xoá. Hãy nhờ chủ workspace cấp quyền.", 403);
  const before = await db.quote.findFirst({ where: scoped(s.where, { id }) });
  if (!before) return fail("Không tìm thấy báo giá", 404);
  await db.quote.delete({ where: { id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "quote.delete", "quote", id, `Xoá báo giá ${before.number} (${before.customerName})`, { before });
  return ok({ deleted: true });
}
