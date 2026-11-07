import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { getThread, listMessages, markRead, postMessage, toMessageDTOs, workspaceMembers } from "@/lib/teamchat/server";
import { extractRefs, MAX_BODY, mergeRefs, parseMembers, REF_KINDS } from "@/lib/teamchat/shared";

type P = { params: Promise<{ id: string }> };

/** Tin gần nhất (hoặc ?before=ISO cho trang cũ hơn). Mở xem = đánh dấu đã đọc (trừ ?peek=1). */
export async function GET(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await getThread(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy hội thoại", 404);
  const sp = new URL(req.url).searchParams;
  const before = sp.get("before") ? new Date(sp.get("before")!) : undefined;
  if (before && isNaN(before.getTime())) return fail("Mốc thời gian không hợp lệ");
  if (sp.get("peek") !== "1") await markRead(a.ctx, t.id);
  const members = await workspaceMembers(a.ctx.workspace.id);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const { rows, hasMore } = await listMessages(a.ctx, t.id, { before, limit: Number(sp.get("limit")) || 60 });
  return ok({ threadId: t.id, members: parseMembers(t.membersJson), messages: await toMessageDTOs(a.ctx, rows, names), hasMore });
}

const Body = z.object({
  body: z.string().max(MAX_BODY, `Tin nhắn tối đa ${MAX_BODY} ký tự`).default(""),
  refs: z.array(z.object({ kind: z.enum(REF_KINDS as [string, ...string[]]), id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) })).max(5).default([]),
});

export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await getThread(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const body = p.data.body.trim();
  const refs = mergeRefs(p.data.refs as never, extractRefs(body));
  if (!body && !refs.length) return fail("Tin nhắn trống");
  const members = await workspaceMembers(a.ctx.workspace.id);
  const msg = await postMessage(a.ctx, t, body, refs, members);
  const [dto] = await toMessageDTOs(a.ctx, [msg], new Map(members.map((m) => [m.id, m.name])));
  return ok(dto, 201);
}
