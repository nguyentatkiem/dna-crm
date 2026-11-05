import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { sendZaloText } from "@/lib/zalo";

/** Nhắn khách qua Zalo OA từ khung chi tiết. Chỉ khách đã nhắn/quan tâm OA (có Zalo user id) mới nhắn được. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const rec = await db.record.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!rec) return fail("Không tìm thấy khách", 404);
  const uid = parseJson<Record<string, string>>(rec.dataJson, {})._zalo_uid;
  if (!uid) return fail("Khách này chưa tương tác với Zalo OA nên chưa nhắn được");
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim() || text.length > 2000) return fail("Tin nhắn trống hoặc quá dài");
  try {
    await sendZaloText(a.ctx.workspace.id, uid, text.trim());
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Gửi Zalo lỗi", 502);
  }
  await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Đã nhắn Zalo OA: ${text.trim()}`, author: a.ctx.user.name } });
  return ok({ ok: true });
}
