import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { findVisibleConversation } from "@/lib/inbox-list";
import { botStatus, setBotOff } from "@/lib/kb/bot";

type P = { params: Promise<{ id: string }> };

/** Trạng thái bot trong một hội thoại (số lần đã trả lời, đã tắt chưa) — cho băng thông báo ở Hộp thư. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  return ok(await botStatus(a.ctx.workspace.id, conv));
}

const Body = z.object({ off: z.boolean() });

/** Tắt / bật lại bot cho riêng hội thoại này. Ai thấy hội thoại đều làm được (để kịp tiếp quản khách). */
export async function PUT(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const conv = await findVisibleConversation(a.ctx, (await params).id);
  if (!conv) return fail("Không tìm thấy hội thoại", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  await setBotOff(a.ctx.workspace.id, conv.id, p.data.off);
  return ok(await botStatus(a.ctx.workspace.id, conv));
}
