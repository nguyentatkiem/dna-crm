import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getThread, toMessageDTOs, workspaceMembers } from "@/lib/teamchat/server";
import { canModify, extractRefs, MAX_BODY, mergeRefs, parseRefMeta } from "@/lib/teamchat/shared";

type P = { params: Promise<{ id: string }> };

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
  return ok({ ok: true });
}
