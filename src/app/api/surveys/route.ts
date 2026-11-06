import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { npsScore } from "@/lib/survey/shared";
import { SurveyBody, canManageSurveys, surveyDTO } from "@/lib/survey/api";
import { originOf, rememberOrigin } from "@/lib/marketing/broadcast";

/** Danh sách khảo sát kèm số đã gửi, đã trả lời, NPS. ?active=1 chỉ lấy khảo sát đang bật (nút gửi nhanh). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  await rememberOrigin(wid, originOf(req));
  const active = new URL(req.url).searchParams.get("active") === "1";
  const surveys = await db.survey.findMany({ where: { workspaceId: wid, ...(active ? { active: true } : {}) }, orderBy: { createdAt: "desc" } });
  const rows = surveys.length ? await db.surveyResponse.findMany({ where: { workspaceId: wid }, select: { surveyId: true, recordId: true, submittedAt: true, nps: true, rating: true } }) : [];
  const items = surveys.map((s) => {
    const rs = rows.filter((r) => r.surveyId === s.id);
    const done = rs.filter((r) => r.submittedAt);
    const ratings = done.map((r) => r.rating).filter((x): x is number => x != null);
    return {
      ...surveyDTO(s),
      sent: rs.filter((r) => r.recordId).length,
      answeredInvites: done.filter((r) => r.recordId).length,
      submitted: done.length,
      nps: npsScore(done.map((r) => r.nps).filter((x): x is number => x != null)),
      avgRating: ratings.length ? Math.round((ratings.reduce((x, y) => x + y, 0) / ratings.length) * 10) / 10 : null,
    };
  });
  return ok({ items, canManage: await canManageSurveys(a.ctx) });
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageSurveys(a.ctx))) return fail("Chỉ chủ hoặc quản lý tạo được khảo sát", 403);
  const p = SurveyBody.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const d = p.data;
  const s = await db.survey.create({ data: { workspaceId: a.ctx.workspace.id, name: d.name, kind: d.kind, questionsJson: JSON.stringify(d.questions), thankYou: d.thankYou || "Cảm ơn bạn đã góp ý!", active: d.active ?? true, createdBy: a.ctx.user.name } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "survey.create", "survey", s.id, `Tạo khảo sát “${s.name}”`);
  return ok(surveyDTO(s), 201);
}
