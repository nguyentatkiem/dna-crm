import { appApi, fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { accessOf } from "@/lib/permissions";
import { conversationWhere } from "@/lib/chat/visibility";
import { ruleScore, scoreAndSave } from "@/lib/chat/quality";

async function find(ctx: Parameters<typeof conversationWhere>[0], id: string) {
  return db.conversation.findFirst({ where: { AND: [{ id }, await conversationWhere(ctx)] }, select: { id: true, quality: true, qualityNote: true, sentiment: true } });
}

/** Điểm chất lượng một hội thoại: ?conv=<id>. Chưa có điểm thì chấm ngay bằng luật. Trả cả chi tiết trừ điểm. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const id = new URL(req.url).searchParams.get("conv") ?? "";
  const c = id ? await find(a.ctx, id) : null;
  if (!c) return fail("Không tìm thấy hội thoại", 404);
  // Chưa từng chấm → chấm bằng luật và lưu; đã có (có thể kèm nhận xét AI của job) → giữ nguyên, chỉ trả thêm chi tiết luật mới nhất.
  if (c.quality == null) {
    const r = await scoreAndSave(a.ctx.workspace.id, c.id, { useAi: false });
    return ok({ conv: c.id, quality: r?.score ?? null, qualityNote: r?.note ?? "", sentiment: c.sentiment, rules: r?.rules ?? null });
  }
  const r = await ruleScore(a.ctx.workspace.id, c.id);
  return ok({ conv: c.id, quality: c.quality, qualityNote: c.qualityNote, sentiment: c.sentiment, rules: r?.rules ?? null });
}

/** Chấm lại ngay (có Claude nhận xét nếu đã cấu hình): body { conv }. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  // Như nút "Chấm lại" trên giao diện: chỉ chủ / quản lý (chấm lại có thể gọi Claude, tốn phí).
  const acc = await accessOf(a.ctx);
  if (!(acc.isOwner || acc.base === "owner" || acc.base === "manager")) return fail("Chỉ chủ hoặc quản lý được chấm lại", 403);
  const body = (await req.json().catch(() => ({}))) as { conv?: string };
  const c = body.conv ? await find(a.ctx, body.conv) : null;
  if (!c) return fail("Không tìm thấy hội thoại", 404);
  const r = await scoreAndSave(a.ctx.workspace.id, c.id, { useAi: true });
  return ok({ conv: c.id, quality: r?.score ?? null, qualityNote: r?.note ?? "", sentiment: c.sentiment, rules: r?.rules ?? null });
}
