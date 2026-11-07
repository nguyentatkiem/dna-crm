import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getThread, toMessageDTOs, workspaceMembers } from "@/lib/teamchat/server";
import { canModify, extractRefs, MAX_BODY, mergeRefs, parseRefMeta, preview } from "@/lib/teamchat/shared";

type P = { params: Promise<{ id: string }> };

/**
 * Thông báo sinh ra khi gửi một tin (nhắc tên / tin riêng) không lưu id tin: nhận diện bằng hội thoại, người gửi
 * và thời điểm (tạo ngay sau tin, trong vài giây).
 */
async function rewriteNotices(workspaceId: string, threadId: string, at: Date, sender: string, next: (old: string) => string) {
  const notes = await db.notification.findMany({
    where: { workspaceId, href: `/w/chat?t=${threadId}`, kind: { in: ["mention", "teamchat"] }, createdAt: { gte: new Date(at.getTime() - 1000), lte: new Date(at.getTime() + 10_000) } },
    select: { id: true, text: true },
  });
  for (const n of notes) if (n.text.startsWith(`${sender} nhắn bạn: `) || n.text.startsWith(`${sender} nhắc bạn trong `)) await db.notification.update({ where: { id: n.id }, data: { text: next(n.text) } });
}

async function load(a: { ctx: Parameters<typeof getThread>[0] }, id: string) {
  const m = await db.chatMessage.findUnique({ where: { id } });
  if (!m) return null;
  const t = await getThread(a.ctx, m.threadId);
  return t ? { m, t } : null;
}

/** Sửa tin của mình trong 15 phút. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const x = await load(a, (await params).id);
  if (!x) return fail("Không tìm thấy tin nhắn", 404);
  if (!canModify(x.m, a.ctx.user.id)) return fail("Chỉ sửa được tin của mình trong 15 phút", 403);
  const p = z.object({ body: z.string().trim().min(1, "Tin nhắn trống").max(MAX_BODY) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const meta = parseRefMeta(x.m.refJson);
  const refs = mergeRefs(meta.refs, extractRefs(p.data.body));
  const u = await db.chatMessage.update({ where: { id: x.m.id }, data: { body: p.data.body, refJson: JSON.stringify({ refs, edited: true }) } });
  // Tin vừa sửa là tin cuối → cập nhật dòng xem trước ở danh sách hội thoại.
  const last = await db.chatMessage.findFirst({ where: { threadId: x.t.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (last?.id === x.m.id) await db.chatThread.update({ where: { id: x.t.id }, data: { lastText: preview(a.ctx.user.name, p.data.body, refs.length) } });
  // Thông báo đã gửi theo tin này hiện nội dung mới (giữ phần "X nhắn bạn: " / "X nhắc bạn trong …: ").
  await rewriteNotices(a.ctx.workspace.id, x.t.id, x.m.createdAt, a.ctx.user.name, (old) => {
    const body = p.data.body.length > 120 ? `${p.data.body.slice(0, 117)}…` : p.data.body;
    const dm = `${a.ctx.user.name} nhắn bạn: `;
    if (old.startsWith(dm)) return dm + body;
    const i = old.indexOf("”: ");
    return i > 0 ? `${old.slice(0, i + 3)}${body}` : old;
  });
  const members = await workspaceMembers(a.ctx.workspace.id);
  const [dto] = await toMessageDTOs(a.ctx, [u], new Map(members.map((m) => [m.id, m.name])));
  return ok(dto);
}

/** Thu hồi tin của mình trong 15 phút (giữ chỗ "Tin nhắn đã được thu hồi"). */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const x = await load(a, (await params).id);
  if (!x) return fail("Không tìm thấy tin nhắn", 404);
  if (!canModify(x.m, a.ctx.user.id)) return fail("Chỉ thu hồi được tin của mình trong 15 phút", 403);
  await db.chatMessage.update({ where: { id: x.m.id }, data: { body: "", refJson: JSON.stringify({ refs: [], deleted: true }) } });
  const last = await db.chatMessage.findFirst({ where: { threadId: x.t.id }, orderBy: { createdAt: "desc" } });
  if (last?.id === x.m.id) await db.chatThread.update({ where: { id: x.t.id }, data: { lastText: `${a.ctx.user.name} đã thu hồi một tin nhắn` } });
  // Thông báo (nhắc tên / tin riêng) đã gửi kèm trích đoạn: thay bằng "đã thu hồi" để nội dung không còn lộ ở chuông thông báo.
  await rewriteNotices(a.ctx.workspace.id, x.t.id, x.m.createdAt, a.ctx.user.name, () => `${a.ctx.user.name} đã thu hồi một tin nhắn`);
  return ok({ ok: true });
}
