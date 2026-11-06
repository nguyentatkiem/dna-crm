import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { recordScope } from "@/lib/permissions";
import { marketingApi } from "@/lib/marketing/guard";
import { enrollRecord, stopEnrollmentsForRecord } from "@/lib/marketing/sequences";
import { viMessage } from "@/lib/format";

type P = { params: Promise<{ id: string }> };

/** Thêm khách vào kịch bản bằng tay (chạy lại từ bước 1 nếu đã từng chạy). */
export async function POST(req: Request, { params }: P) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { id } = await params;
  const { recordId } = (await req.json().catch(() => ({}))) as { recordId?: string };
  if (!recordId) return fail("Chọn khách cần thêm");
  const rec = await db.record.findFirst({ where: { ...(await recordScope(a.ctx)), id: recordId } });
  if (!rec) return fail("Không tìm thấy khách", 404);
  try {
    await enrollRecord(a.ctx.workspace.id, id, recordId);
  } catch (e) {
    return fail(viMessage(e, "Không thêm được"));
  }
  return ok({ ok: true });
}

/** Dừng kịch bản cho một khách ({ recordId, reason }). */
export async function DELETE(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const recordId = sp.get("recordId");
  if (!recordId) return fail("Thiếu khách");
  await stopEnrollmentsForRecord(a.ctx.workspace.id, recordId, sp.get("reason") || `Dừng tay bởi ${a.ctx.user.name}`);
  return ok({ ok: true });
}
