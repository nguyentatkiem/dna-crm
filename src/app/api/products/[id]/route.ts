import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { can, getRole } from "@/lib/permissions";
import { ProductInput, firstError } from "@/lib/sales/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "see_all")) return fail("Chỉ chủ và quản lý được sửa sản phẩm", 403);
  const { id } = await params;
  const before = await db.product.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!before) return fail("Không tìm thấy sản phẩm", 404);
  // Cho phép gửi riêng { active } để bật/tắt nhanh.
  const p = ProductInput.partial().safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const item = await db.product.update({ where: { id }, data: p.data });
  const diff = diffOf(before as unknown as Record<string, unknown>, p.data);
  if (Object.keys(diff).length) await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "product.update", "product", id, `Sửa sản phẩm “${item.name}”: ${Object.keys(diff).join(", ")}`, diff);
  return ok(item);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "delete")) return fail("Bạn không có quyền xoá. Hãy nhờ chủ hoặc quản lý.", 403);
  const { id } = await params;
  const before = await db.product.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!before) return fail("Không tìm thấy sản phẩm", 404);
  // Báo giá/đơn đã lưu tên và giá trong itemsJson nên xoá sản phẩm không làm hỏng chứng từ cũ.
  await db.product.delete({ where: { id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "product.delete", "product", id, `Xoá sản phẩm “${before.name}”`, { before });
  return ok({ deleted: true });
}
