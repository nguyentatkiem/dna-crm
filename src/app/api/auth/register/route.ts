import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, parseJson } from "@/lib/db";
import { SESSION_COOKIE, cookieOptions, signSession } from "@/lib/auth";
import type { WorkspaceConfig } from "@/lib/config/schema";
import { fail, ok } from "@/lib/http";

const Body = z.object({
  name: z.string().trim().min(1, "Hãy nhập họ tên"),
  email: z.string().trim().toLowerCase().email("Email chưa đúng định dạng"),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự"),
  invite: z.string().optional(),
});

/**
 * Bản tự cài: người đăng ký đầu tiên tạo workspace và là chủ.
 * Những người sau chỉ đăng ký được bằng link mời do chủ workspace tạo.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const { name, email, password, invite } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return fail("Email đã có tài khoản. Hãy đăng nhập.");

  const firstRun = (await db.user.count()) === 0;
  const inv = invite ? await db.invite.findUnique({ where: { token: invite } }) : null;
  if (!firstRun && (!inv || inv.usedAt || inv.expiresAt < new Date())) return fail("Cần link mời còn hiệu lực từ chủ workspace để đăng ký.", 403);

  const passwordHash = await bcrypt.hash(password, 10);
  const { user, workspaceId, onboarded } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name, passwordHash } });
    if (inv) {
      await tx.membership.create({ data: { userId: user.id, workspaceId: inv.workspaceId, role: inv.role } });
      await tx.invite.update({ where: { token: inv.token }, data: { usedAt: new Date() } });
      // Thêm tên người mới vào danh sách đội để gán người phụ trách được ngay.
      const cfg = await tx.workspaceConfig.findFirst({ where: { workspaceId: inv.workspaceId, isActive: true } });
      const c = parseJson<WorkspaceConfig | null>(cfg?.configJson, null);
      if (cfg && c && !c.team.includes(name)) await tx.workspaceConfig.update({ where: { id: cfg.id }, data: { configJson: JSON.stringify({ ...c, team: [...c.team, name] }) } });
      const ws = await tx.workspace.findUniqueOrThrow({ where: { id: inv.workspaceId } });
      return { user, workspaceId: ws.id, onboarded: ws.onboarded };
    }
    const ws = await tx.workspace.create({ data: { name: `Doanh nghiệp của ${name}` } });
    await tx.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "owner" } });
    return { user, workspaceId: ws.id, onboarded: false };
  });

  const res = ok({ redirect: onboarded ? "/w" : "/onboarding" });
  res.cookies.set(SESSION_COOKIE, await signSession({ uid: user.id, wid: workspaceId }), cookieOptions);
  return res;
}
