import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { findScopedRecord } from "@/lib/permissions";
import { SURVEY_CHANNELS } from "@/lib/survey/shared";
import { canManageSurveys } from "@/lib/survey/api";
import { sendSurvey, sendSurveyToSegment } from "@/lib/survey/service";
import { originOf, rememberOrigin } from "@/lib/marketing/broadcast";

type P = { params: Promise<{ id: string }> };
const Body = z.object({ recordId: z.string().max(60).optional(), segmentId: z.string().max(60).optional(), channel: z.enum(SURVEY_CHANNELS).catch("link") });

/** Gửi khảo sát cho một khách (mọi nhân viên) hoặc cả nhóm khách (chủ/quản lý). */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  await rememberOrigin(wid, originOf(req));
  const s = await db.survey.findFirst({ where: { id: (await params).id, workspaceId: wid } });
  if (!s) return fail("Không tìm thấy khảo sát", 404);
  if (!s.active) return fail("Khảo sát đang tắt, hãy bật trước khi gửi", 409);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const { recordId, segmentId, channel } = p.data;
  if (segmentId) {
    if (!(await canManageSurveys(a.ctx))) return fail("Bạn chưa có quyền gửi khảo sát cho cả nhóm", 403);
    if (!(await db.segment.findFirst({ where: { id: segmentId, workspaceId: wid }, select: { id: true } }))) return fail("Không tìm thấy nhóm khách", 404);
    const r = await sendSurveyToSegment(wid, s.id, segmentId, channel);
    if (!r.total) return fail("Nhóm khách chưa có khách nào", 400);
    await audit({ workspaceId: wid, user: a.ctx.user }, "survey.send", "survey", s.id, `Gửi khảo sát “${s.name}” cho ${r.sent} khách`);
    return ok(r);
  }
  if (!recordId) return fail("Chọn khách hoặc nhóm khách");
  const rec = await findScopedRecord(a.ctx, recordId);
  if (!rec) return fail("Không tìm thấy khách", 404);
  const r = await sendSurvey(wid, { surveyId: s.id, recordId: rec.id, channel });
  if (!r.url) return fail(r.error ?? "Không gửi được");
  return ok(r);
}
