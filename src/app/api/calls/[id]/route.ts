import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { scoreCall } from "@/lib/calls";
import { allowed, callScope } from "@/lib/permissions";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  transcript: z.string().max(100000).optional(),
  reviewScore: z.number().int().min(0).max(100).nullable().optional(),
  reviewNote: z.string().max(2000).optional(),
  rescore: z.boolean().optional(),
});

/** Sửa bản chép lời (chấm lại), hoặc quản lý chấm lại điểm: dữ liệu này là đầu vào của vòng phản hồi. */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const call = await db.call.findFirst({ where: { AND: [await callScope(a.ctx), { id }] } });
  if (!call) return fail("Không tìm thấy cuộc gọi", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const b = parsed.data;
  if (b.reviewScore !== undefined || b.reviewNote !== undefined) {
    if (!(await allowed(a.ctx, "calls_review"))) return fail("Bạn chưa có quyền chấm điểm cuộc gọi", 403);
    await db.call.update({ where: { id }, data: { reviewScore: b.reviewScore, reviewNote: b.reviewNote ?? call.reviewNote, reviewedBy: a.ctx.user.name, reviewedAt: new Date() } });
    if (call.recordId && b.reviewScore != null) {
      await db.activity.create({ data: { recordId: call.recordId, kind: "update", body: `Quản lý chấm lại cuộc gọi: ${b.reviewScore}/100 (AI: ${call.aiScore ?? "–"}). ${b.reviewNote ?? ""}`, author: a.ctx.user.name } });
    }
  }
  let score = null;
  if (b.transcript !== undefined || b.rescore) {
    const changed = b.transcript !== undefined && b.transcript !== call.transcript;
    // Sửa bản chép lời thì hội thoại cũ không còn khớp: xoá để dựng lại theo bản mới.
    const updated = await db.call.update({ where: { id }, data: { transcript: b.transcript ?? call.transcript, ...(changed ? { segmentsJson: "" } : {}) } });
    score = await scoreCall(updated);
  }
  return ok({ ok: true, score });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  if (!(await allowed(a.ctx, "calls_delete"))) return fail("Bạn chưa có quyền xoá cuộc gọi", 403);
  await db.call.deleteMany({ where: { id, workspaceId: a.ctx.workspace.id } });
  return ok({ ok: true });
}
