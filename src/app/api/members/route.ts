import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";

async function isOwner(userId: string, workspaceId: string) {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  return m?.role === "owner";
}

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [members, invites] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: wid }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } }),
    db.invite.findMany({ where: { workspaceId: wid, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  return ok({
    me: a.ctx.user.id,
    isOwner: await isOwner(a.ctx.user.id, wid),
    members: members.map((m) => ({ ...m.user, role: m.role })),
    invites: invites.map((i) => ({ token: i.token, expiresAt: i.expiresAt })),
  });
}

/** Tạo link mời dùng một lần, hết hạn sau 7 ngày. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await isOwner(a.ctx.user.id, a.ctx.workspace.id))) return fail("Chỉ chủ workspace được mời thành viên", 403);
  const token = randomBytes(18).toString("base64url");
  await db.invite.create({ data: { token, workspaceId: a.ctx.workspace.id, expiresAt: new Date(Date.now() + 7 * 864e5) } });
  const origin = new URL(req.url).origin;
  return ok({ url: `${origin}/register?invite=${token}` }, 201);
}