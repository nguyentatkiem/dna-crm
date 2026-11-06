import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { setPref } from "@/lib/prefs";
import { SURVEY_CHANNELS } from "@/lib/survey/shared";
import { canManageSurveys } from "@/lib/survey/api";
import { surveyPref } from "@/lib/survey/service";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await surveyPref(a.ctx.workspace.id));
}

const Body = z.object({ afterTicketSurveyId: z.string().max(60).catch(""), afterTicketChannel: z.enum(SURVEY_CHANNELS).catch("link"), message: z.string().trim().max(1000) });

/** Khảo sát tự gửi khi phiếu hỗ trợ được xử lý, và mẫu tin mời. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageSurveys(a.ctx))) return fail("Chỉ chủ hoặc quản lý sửa được cài đặt", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const d = p.data;
  if (d.afterTicketSurveyId && !(await db.survey.findFirst({ where: { id: d.afterTicketSurveyId, workspaceId: a.ctx.workspace.id }, select: { id: true } }))) return fail("Không tìm thấy khảo sát", 404);
  if (d.message && !d.message.includes("{link}")) return fail("Mẫu tin cần có {link} để chèn đường dẫn khảo sát");
  await setPref(a.ctx.workspace.id, "survey", d);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "survey.settings", "survey", "", "Sửa cài đặt khảo sát");
  return ok(d);
}
