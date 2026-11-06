import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canManageVouchers } from "@/lib/voucher/api";

type P = { params: Promise<{ id: string }> };

/** Huỷ một mã chưa dùng ({ status: "void" }). */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageVouchers(a.ctx))) return fail("Bạn chưa có quyền huỷ mã voucher", 403);
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (body.status !== "void") return fail("Chỉ hỗ trợ huỷ mã");
  const v = await db.voucher.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!v) return fail("Không tìm thấy mã", 404);
  if (v.status === "used") return fail("Mã đã dùng cho đơn hàng, không huỷ được", 409);
  await db.voucher.update({ where: { id: v.id }, data: { status: "void" } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "voucher.void", "voucher", v.id, `Huỷ voucher ${v.code}`);
  return ok({ ok: true });
}
