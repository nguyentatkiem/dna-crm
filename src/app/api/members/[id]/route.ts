import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const wid = a.ctx.workspace.id;
  const me = await db.membership.findUnique({ where: { userId_workspaceId: { userId: a.ctx.user.id, workspaceId: wid } } });
  if (me?.role !== "owner") return { error: fail("Chỉ chủ workspace được làm việc này", 403) } as const;
  const target = await db.membership.findUnique({ where: { userId_workspaceId: { userId: id, workspaceId: wid } } });
  if (!target) return { error: fail("Không tìm thấy thành viên", 404) } as const;
  return { wid, meId: a.ctx.user.id, target } as const;
}

/** Chủ workspace đặt lại mật khẩu cho thành viên (bản tự cài không gửi email). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || password.length < 8) return fail("Mật khẩu mới cần ít nhất 8 ký tự");
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return ok({ updated: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (id === g.meId) return fail("Không thể xoá chính bạn");
  await db.membership.delete({ where: { userId_workspaceId: { userId: id, workspaceId: g.wid } } });
  return ok({ removed: true });
}
