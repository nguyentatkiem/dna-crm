import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { SurveyBody, canManageSurveys, surveyDTO } from "@/lib/survey/api";
import { surveyPref, surveyReport } from "@/lib/survey/service";
import { setPref } from "@/lib/prefs";

type P = { params: Promise<{ id: string }> };

/** Khảo sát + báo cáo kết quả. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await db.survey.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!s) return fail("Không tìm thấy khảo sát", 404);
  return ok({ survey: surveyDTO(s), report: await surveyReport(s), canManage: await canManageSurveys(a.ctx) });
}

/** Sửa toàn bộ, hoặc chỉ bật/tắt ({ active }). */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageSurveys(a.ctx))) return fail("Chỉ chủ hoặc quản lý sửa được khảo sát", 403);
  const s = await db.survey.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!s) return fail("Không tìm thấy khảo sát", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    const u = await db.survey.update({ where: { id: s.id }, data: { active: body.active } });
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "survey.update", "survey", s.id, `${body.active ? "Bật" : "Tắt"} khảo sát “${s.name}”`);
    return ok(surveyDTO(u));
  }
  const p = SurveyBody.safeParse(body);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const d = p.data;
  const u = await db.survey.update({ where: { id: s.id }, data: { name: d.name, kind: d.kind, questionsJson: JSON.stringify(d.questions), thankYou: d.thankYou || "Cảm ơn bạn đã góp ý!", ...(d.active !== undefined ? { active: d.active } : {}) } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "survey.update", "survey", s.id, `Sửa khảo sát “${u.name}”`);
  return ok(surveyDTO(u));
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageSurveys(a.ctx))) return fail("Chỉ chủ hoặc quản lý xoá được khảo sát", 403);
  const s = await db.survey.findFirst({ where: { id: (await params).id, workspaceId: a.ctx.workspace.id } });
  if (!s) return fail("Không tìm thấy khảo sát", 404);
  await db.survey.delete({ where: { id: s.id } });
  // Khảo sát đang được chọn để tự gửi sau phiếu hỗ trợ thì bỏ chọn, tránh cài đặt trỏ vào khảo sát đã xoá.
  const pref = await surveyPref(a.ctx.workspace.id);
  if (pref.afterTicketSurveyId === s.id) await setPref(a.ctx.workspace.id, "survey", { ...pref, afterTicketSurveyId: "" });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "survey.delete", "survey", s.id, `Xoá khảo sát “${s.name}” và các câu trả lời`);
  return ok({ deleted: true });
}
