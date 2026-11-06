import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { canEditDoc, docScope, resolveLinks, scoped } from "@/lib/sales/access";
import { ContractInput, firstError } from "@/lib/sales/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  const before = await db.contract.findFirst({ where: scoped(s.where, { id }) });
  if (!before) return fail("Không tìm thấy hợp đồng", 404);
  if (!canEditDoc(a.ctx, s.seeAll, before)) return fail("Chỉ người tạo hoặc quản lý được sửa hợp đồng này", 403);
  const p = ContractInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const order = d.orderId ? await db.order.findFirst({ where: scoped(s.where, { id: d.orderId }) }) : null;
  const endChanged = (d.endAt?.getTime() ?? 0) !== (before.endAt?.getTime() ?? 0) || d.remindDays !== before.remindDays;
  const data = {
    ...(await resolveLinks(a.ctx, { contactId: d.contactId ?? order?.contactId, recordId: d.recordId ?? order?.recordId })),
    orderId: order?.id ?? null,
    title: d.title,
    customerName: d.customerName,
    value: d.value,
    status: d.status,
    signedAt: d.signedAt ?? null,
    startAt: d.startAt ?? null,
    endAt: d.endAt ?? null,
    remindDays: d.remindDays,
    fileUrl: d.fileUrl,
    note: d.note,
    // Gia hạn hoặc đổi số ngày nhắc thì nhắc lại từ đầu.
    ...(endChanged ? { remindedAt: null } : {}),
  };
  const c = await db.contract.update({ where: { id }, data });
  const diff = diffOf(before as unknown as Record<string, unknown>, { ...data, remindedAt: undefined });
  if (Object.keys(diff).length) await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "contract.update", "contract", id, `Sửa hợp đồng ${c.number}: ${Object.keys(diff).join(", ")}`, diff);
  return ok(c);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await docScope(a.ctx);
  if (!can(s.role, "delete")) return fail("Bạn không có quyền xoá. Hãy nhờ chủ hoặc quản lý.", 403);
  const before = await db.contract.findFirst({ where: scoped(s.where, { id }) });
  if (!before) return fail("Không tìm thấy hợp đồng", 404);
  await db.contract.delete({ where: { id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "contract.delete", "contract", id, `Xoá hợp đồng ${before.number} “${before.title}”`, { before });
  return ok({ deleted: true });
}
