import type { BoardView } from "@prisma/client";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { allow, getAccess } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { ViewPatch, canEditView } from "@/lib/views";
import { viewDTO } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

type Loaded = { error: Response } | { error?: undefined; ctx: { workspace: { id: string }; user: { id: string; name: string } }; v: BoardView; role: boolean };

async function load(id: string): Promise<Loaded> {
  const a = await appApi();
  if ("error" in a) return { error: a.error ?? fail("Bạn cần đăng nhập lại", 401) };
  const v = await db.boardView.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!v || (v.ownerId !== a.ctx.user.id && !v.shared)) return { error: fail("Không tìm thấy dạng xem", 404) };
  const role = await getAccess(a.ctx.user.id, a.ctx.workspace.id).then((x) => allow(x, "view_manage_shared"));
  return { ctx: a.ctx, v, role };
}

/** Đổi tên, chia sẻ, đặt mặc định, hoặc lưu đè trạng thái. */
export async function PATCH(req: Request, { params }: Ctx) {
  const x = await load((await params).id);
  if (x.error) return x.error;
  const { ctx, v, role } = x;
  const p = ViewPatch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const { name, shared, isDefault, state } = p.data;
  const mine = v.ownerId === ctx.user.id;
  // Đặt mặc định chỉ áp cho dạng xem của chính mình; các thay đổi khác cần quyền sửa.
  if ((name !== undefined || shared !== undefined || state !== undefined) && !canEditView(v, ctx.user.id, role)) return fail("Chỉ người tạo hoặc người có quyền “Sửa dạng xem dùng chung” mới sửa được dạng xem này", 403);
  if (isDefault !== undefined && !mine) return fail("Chỉ đặt mặc định được cho dạng xem của bạn. Hãy lưu thành dạng xem riêng trước.", 403);
  if (shared === false && !mine) return fail("Chỉ người tạo mới thôi chia sẻ được", 403);
  if (isDefault) await db.boardView.updateMany({ where: { workspaceId: ctx.workspace.id, objectKey: v.objectKey, ownerId: ctx.user.id, id: { not: v.id } }, data: { isDefault: false } });
  const u = await db.boardView.update({ where: { id: v.id }, data: { name, shared, isDefault, stateJson: state ? JSON.stringify(state) : undefined } });
  if (shared !== undefined && shared !== v.shared) await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "view.share", "view", v.id, `${shared ? "Chia sẻ" : "Thôi chia sẻ"} dạng xem “${u.name}” (${v.objectKey})`);
  return ok(viewDTO(u, ctx.user.id, role));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const x = await load((await params).id);
  if (x.error) return x.error;
  const { ctx, v, role } = x;
  if (!canEditView(v, ctx.user.id, role)) return fail("Chỉ người tạo hoặc người có quyền “Sửa dạng xem dùng chung” mới xoá được dạng xem này", 403);
  await db.boardView.delete({ where: { id: v.id } });
  if (v.shared) await audit({ workspaceId: ctx.workspace.id, user: ctx.user }, "view.delete", "view", v.id, `Xoá dạng xem chia sẻ “${v.name}” (${v.objectKey})`);
  return ok({ deleted: true });
}
