import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { ensureDm, listThreads, workspaceMembers } from "@/lib/teamchat/server";

/** Danh sách hội thoại của tôi (nhóm + 1-1 với mọi thành viên) và danh bạ thành viên. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const members = await workspaceMembers(a.ctx.workspace.id);
  const threads = await listThreads(a.ctx, members);
  return ok({ me: a.ctx.user.id, members: members.map((m) => ({ id: m.id, name: m.name })), threads, totalUnread: threads.reduce((s, t) => s + t.unread, 0) });
}

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dm"), userId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("group"), name: z.string().trim().min(1, "Hãy đặt tên nhóm").max(80), members: z.array(z.string().min(1).max(64)).max(200) }),
]);

/** Tạo nhóm, hoặc mở (tạo nếu chưa có) DM với một thành viên. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  if (p.data.kind === "dm") {
    const t = await ensureDm(a.ctx, p.data.userId);
    if (!t) return fail("Không tìm thấy thành viên", 404);
    return ok({ id: t.id });
  }
  const valid = new Set((await db.membership.findMany({ where: { workspaceId: a.ctx.workspace.id }, select: { userId: true } })).map((m) => m.userId));
  const members = [...new Set([a.ctx.user.id, ...p.data.members.filter((u) => valid.has(u))])];
  if (members.length < 2) return fail("Chọn ít nhất một thành viên khác");
  const t = await db.chatThread.create({ data: { workspaceId: a.ctx.workspace.id, kind: "group", name: p.data.name, membersJson: JSON.stringify(members), createdBy: a.ctx.user.id, lastText: `${a.ctx.user.name} đã tạo nhóm`, lastAt: new Date() } });
  return ok({ id: t.id }, 201);
}
