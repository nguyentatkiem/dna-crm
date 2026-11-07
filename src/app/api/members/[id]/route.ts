import { revokeAllSessions } from "@/lib/security/sessions";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { workspaceRoles } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

async function guard(id: string) {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const wid = a.ctx.workspace.id;
  const me = await db.membership.findUnique({ where: { userId_workspaceId: { userId: a.ctx.user.id, workspaceId: wid } } });
  if (me?.role !== "owner") return { error: fail("Chỉ chủ workspace được làm việc này", 403) } as const;
  const target = await db.membership.findUnique({ where: { userId_workspaceId: { userId: id, workspaceId: wid } }, include: { user: { select: { name: true, email: true } } } });
  if (!target) return { error: fail("Không tìm thấy thành viên", 404) } as const;
  return { wid, meId: a.ctx.user.id, me: a.ctx.user, target } as const;
}

const ownerCount = (wid: string) => db.membership.count({ where: { workspaceId: wid, role: "owner" } });

/**
 * Chủ workspace: đặt lại mật khẩu ({ password }) hoặc đổi vai trò ({ role }).
 * Bản tự cài không gửi email nên mật khẩu mới do chủ tự báo cho thành viên.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { password?: string; role?: string };
  const who = { workspaceId: g.wid, user: g.me };

  if (body.role !== undefined) {
    // Chỉ nhận khoá vai trò đang tồn tại (Chủ, Quản lý, Nhân viên hoặc vai trò tự tạo).
    const defs = await workspaceRoles(g.wid);
    const next = defs.find((d) => d.key === body.role);
    if (!next) return fail("Vai trò không hợp lệ");
    const role = next.key;
    const cur = g.target.role;
    const curName = defs.find((d) => d.key === cur)?.name ?? cur;
    if (role === cur) return ok({ updated: true, role });
    if (cur === "owner" && (await ownerCount(g.wid)) <= 1) return fail("Workspace cần ít nhất một chủ. Hãy đặt người khác làm chủ trước.");
    await db.membership.update({ where: { userId_workspaceId: { userId: id, workspaceId: g.wid } }, data: { role } });
    await audit(who, "member.role", "member", id, `Đổi vai trò ${g.target.user.name}: ${curName} → ${next.name}`, { role: [curName, next.name] });
    if (id !== g.meId) await notify(g.wid, { userId: id, kind: "system", text: `${g.me.name} đổi vai trò của bạn thành ${next.name}`, href: "/w/settings" });
    return ok({ updated: true, role });
  }

  const { password } = body;
  if (!password || password.length < 8) return fail("Mật khẩu mới cần ít nhất 8 ký tự");
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), failedLogins: 0, lockedUntil: null } });
  // Đặt lại mật khẩu thì đăng xuất mọi phiên cũ của người đó.
  await revokeAllSessions(id);
  await audit(who, "member.password", "member", id, `Đặt lại mật khẩu cho ${g.target.user.name}`);
  return ok({ updated: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guard(id);
  if ("error" in g) return g.error;
  if (id === g.meId) return fail("Không thể xoá chính bạn");
  if (g.target.role === "owner" && (await ownerCount(g.wid)) <= 1) return fail("Không thể xoá chủ cuối cùng của workspace");
  await db.membership.delete({ where: { userId_workspaceId: { userId: id, workspaceId: g.wid } } });
  await audit({ workspaceId: g.wid, user: g.me }, "member.remove", "member", id, `Xoá ${g.target.user.name} (${g.target.user.email}) khỏi workspace`, { role: [g.target.role, ""] });
  return ok({ removed: true });
}
