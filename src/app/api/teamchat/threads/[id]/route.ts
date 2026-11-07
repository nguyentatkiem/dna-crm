import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { canManageThread, getThread } from "@/lib/teamchat/server";
import { parseMembers } from "@/lib/teamchat/shared";

const Body = z.object({
  name: z.string().trim().min(1, "Tên nhóm không được trống").max(80).optional(),
  add: z.array(z.string().min(1).max(64)).max(200).optional(),
  remove: z.array(z.string().min(1).max(64)).max(200).optional(),
  leave: z.boolean().optional(),
});

/** Đổi tên / thêm / bớt thành viên (người tạo nhóm hoặc chủ workspace); rời nhóm (ai cũng được). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await getThread(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy hội thoại", 404);
  if (t.kind !== "group") return fail("Chỉ nhóm mới đổi được thành viên");
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  let members = parseMembers(t.membersJson);
  const notes: string[] = [];

  if (d.leave) {
    members = members.filter((u) => u !== a.ctx.user.id);
    notes.push(`${a.ctx.user.name} đã rời nhóm`);
  } else {
    if ((d.name || d.add?.length || d.remove?.length) && !(await canManageThread(a.ctx, t))) return fail("Chỉ người tạo nhóm hoặc chủ workspace sửa được nhóm", 403);
    if (d.add?.length) {
      const ms = await db.membership.findMany({ where: { workspaceId: a.ctx.workspace.id, userId: { in: d.add } }, select: { userId: true, user: { select: { name: true } } } });
      const fresh = ms.filter((m) => !members.includes(m.userId));
      members = [...members, ...fresh.map((m) => m.userId)];
      if (fresh.length) notes.push(`${a.ctx.user.name} đã thêm ${fresh.map((m) => m.user.name).join(", ")}`);
    }
    if (d.remove?.length) {
      const before = members.length;
      members = members.filter((u) => u === a.ctx.user.id || !d.remove!.includes(u));
      if (members.length < before) notes.push(`${a.ctx.user.name} đã bớt ${before - members.length} thành viên`);
    }
    if (d.name && d.name !== t.name) notes.push(`${a.ctx.user.name} đổi tên nhóm thành “${d.name}”`);
  }
  if (!members.length) {
    await db.chatThread.delete({ where: { id: t.id } });
    return ok({ ok: true, deleted: true });
  }
  await db.chatThread.update({ where: { id: t.id }, data: { membersJson: JSON.stringify(members), ...(d.name && !d.leave ? { name: d.name } : {}), ...(notes.length ? { lastText: notes.join(" · ").slice(0, 140) } : {}) } });
  return ok({ ok: true, left: !!d.leave });
}
