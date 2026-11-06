// Nghiệp vụ khảo sát phía máy chủ: gửi lời mời, nhận câu trả lời, báo cáo.
import type { Survey, SurveyResponse } from "@prisma/client";
import { db, parseJson } from "../db";
import { getPref } from "../prefs";
import { notify, userIdByName } from "../notify";
import { sendMessage, type Channel } from "../marketing/messaging";
import { publicOrigin } from "../marketing/broadcast";
import { loadCfg } from "../marketing/store";
import { resolveSegment } from "../care/segments";
import { NPS_LABEL, SURVEY_PREF_DEFAULT, avgRating, npsBreakdown, npsBucket, npsScore, questionStats, weeklyTrend, type Answers, type NpsBucket, type Question, type SurveyPref } from "./shared";

// HỢP ĐỒNG (đợt B hiện thực). Tự động hoá, phiếu hỗ trợ gọi các hàm này.
export type SendSurveyInput = { surveyId: string; recordId: string; channel?: "link" | "zalo" | "zns" | "sms" | "email"; ticketId?: string };

export const surveyPref = (wid: string) => getPref<SurveyPref>(wid, "survey", SURVEY_PREF_DEFAULT);
export const questionsOf = (s: Pick<Survey, "questionsJson">) => parseJson<Question[]>(s.questionsJson, []);

const linkOf = (origin: string, token: string) => `${origin}/s/${token}`;

/** Tạo lời mời khảo sát cá nhân hoá (và gửi qua kênh nếu có). Trả link công khai /s/<token>. */
export async function sendSurvey(workspaceId: string, input: SendSurveyInput): Promise<{ ok: boolean; url?: string; error?: string }> {
  const survey = await db.survey.findFirst({ where: { id: input.surveyId, workspaceId } });
  if (!survey) return { ok: false, error: "Không tìm thấy khảo sát" };
  if (!survey.active) return { ok: false, error: "Khảo sát đang tắt" };
  const rec = await db.record.findFirst({ where: { id: input.recordId, workspaceId }, select: { id: true, title: true } });
  if (!rec) return { ok: false, error: "Không tìm thấy khách" };
  const channel = input.channel ?? "link";
  const r = await db.surveyResponse.create({ data: { workspaceId, surveyId: survey.id, recordId: rec.id, ticketId: input.ticketId ?? null, channel } });
  const url = linkOf(await publicOrigin(workspaceId), r.token);
  if (channel === "link") {
    await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Tạo link khảo sát “${survey.name}”: ${url}`, author: "Khảo sát" } });
    return { ok: true, url };
  }
  const pref = await surveyPref(workspaceId);
  const body = (pref.message || SURVEY_PREF_DEFAULT.message).replace(/\{link\}/g, url);
  const res = await sendMessage(workspaceId, { channel: channel as Channel, recordId: rec.id, subject: survey.name, body: body.includes(url) ? body : `${body}\n${url}`, params: { link: url } });
  return res.ok ? { ok: true, url } : { ok: false, url, error: res.error };
}

/** Gửi khảo sát cho cả nhóm khách. Trả số lời mời đã tạo và số lỗi gửi. */
export async function sendSurveyToSegment(workspaceId: string, surveyId: string, segmentId: string, channel: SendSurveyInput["channel"] = "link") {
  const rows = (await resolveSegment(workspaceId, segmentId)).filter((r) => r.objectKey === "contacts").slice(0, 2000);
  let sent = 0, failed = 0;
  for (const r of rows) {
    const x = await sendSurvey(workspaceId, { surveyId, recordId: r.id, channel });
    if (x.url) sent++;
    if (!x.ok) failed++;
  }
  return { total: rows.length, sent, failed };
}

/** Nhóm NPS của một câu trả lời: theo điểm NPS, nếu chỉ có sao thì 5 ủng hộ, 4 trung lập, ≤3 phản đối. */
export function bucketOf(r: { nps: number | null; rating: number | null }): NpsBucket | null {
  if (r.nps != null) return npsBucket(r.nps);
  if (r.rating != null) return r.rating >= 5 ? "promoter" : r.rating === 4 ? "passive" : "detractor";
  return null;
}

/** Sau khi khách gửi: ghi điểm lên hồ sơ khách, hoạt động, báo người phụ trách khi phản đối, chạy tự động hoá. */
export async function afterSubmit(survey: Survey, r: SurveyResponse) {
  const wid = survey.workspaceId;
  const bucket = bucketOf(r);
  const rec = r.recordId ? await db.record.findFirst({ where: { id: r.recordId, workspaceId: wid } }) : null;
  if (!rec) return;
  const data = parseJson<Record<string, unknown>>(rec.dataJson, {});
  const at = (r.submittedAt ?? new Date()).toISOString();
  if (r.nps != null) Object.assign(data, { _nps: r.nps, _nps_at: at });
  if (r.rating != null) Object.assign(data, { _csat: r.rating, _csat_at: at });
  const updated = r.nps != null || r.rating != null ? await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify(data) } }) : rec;
  const score = r.nps != null ? `chấm NPS ${r.nps}` : r.rating != null ? `chấm ${r.rating}/5 sao` : "trả lời khảo sát";
  const body = `Khách ${score}${bucket ? ` – ${NPS_LABEL[bucket]}` : ""} (“${survey.name}”)${r.comment ? `: “${r.comment.slice(0, 300)}”` : ""}`;
  await db.activity.create({ data: { recordId: rec.id, kind: "update", body, author: "Khảo sát" } });
  const bad = r.nps != null ? r.nps <= 6 : r.rating != null && r.rating <= 2;
  if (bad) {
    const text = `${rec.title} ${score} cho “${survey.name}”${r.comment ? `: “${r.comment.slice(0, 120)}”` : ""}. Nên liên hệ sớm.`;
    const href = `/w/surveys/${survey.id}?response=${r.id}`;
    const owner = await userIdByName(wid, rec.ownerName);
    if (owner) await notify(wid, { userId: owner, kind: "survey", text, href });
    else for (const m of await db.membership.findMany({ where: { workspaceId: wid, role: { in: ["owner", "manager"] } }, select: { userId: true } })) await notify(wid, { userId: m.userId, kind: "survey", text, href });
  }
  if (bucket) {
    const cfg = await loadCfg(wid);
    // Nhập động để tránh vòng import với automation (tự động hoá cũng gọi sendSurvey).
    if (cfg) await import("../automation").then((m) => m.fireEvent(wid, cfg, { kind: "survey_answered", record: updated, value: bucket })).catch((e) => console.error("[survey] fireEvent", e instanceof Error ? e.message : e));
  }
}

/** Ghi câu trả lời của link cá nhân. Một token chỉ nhận một lần (điều kiện submittedAt: null). */
export async function submitInvite(token: string, clean: { answers: Answers; nps: number | null; rating: number | null; comment: string }) {
  const r = await db.surveyResponse.findUnique({ where: { token }, include: { survey: true } });
  if (!r || !r.survey.active) return { ok: false, error: "Khảo sát không còn nhận câu trả lời", status: 404 } as const;
  const now = new Date();
  const claim = await db.surveyResponse.updateMany({ where: { id: r.id, submittedAt: null }, data: { answersJson: JSON.stringify(clean.answers), nps: clean.nps, rating: clean.rating, comment: clean.comment, submittedAt: now } });
  if (!claim.count) return { ok: false, error: "Bạn đã gửi câu trả lời rồi. Cảm ơn bạn!", status: 409 } as const;
  const fresh = { ...r, answersJson: JSON.stringify(clean.answers), nps: clean.nps, rating: clean.rating, comment: clean.comment, submittedAt: now };
  await afterSubmit(r.survey, fresh).catch((e) => console.error("[survey] afterSubmit", e instanceof Error ? e.message : e));
  return { ok: true, thankYou: r.survey.thankYou } as const;
}

/** Ghi câu trả lời từ link mở (không gắn khách). */
export async function submitOpen(survey: Survey, clean: { answers: Answers; nps: number | null; rating: number | null; comment: string }) {
  const now = new Date();
  await db.surveyResponse.create({ data: { workspaceId: survey.workspaceId, surveyId: survey.id, channel: "link", answersJson: JSON.stringify(clean.answers), nps: clean.nps, rating: clean.rating, comment: clean.comment, sentAt: now, submittedAt: now } });
  return { ok: true, thankYou: survey.thankYou } as const;
}

/** Báo cáo một khảo sát: NPS, phân bố, tỷ lệ phản hồi, xu hướng theo tuần, góp ý, thống kê từng câu. */
export async function surveyReport(survey: Survey) {
  const rows = await db.surveyResponse.findMany({ where: { workspaceId: survey.workspaceId, surveyId: survey.id }, orderBy: { sentAt: "desc" }, take: 5000 });
  const done = rows.filter((r) => r.submittedAt);
  const invites = rows.filter((r) => r.recordId);
  const recIds = [...new Set(done.map((r) => r.recordId).filter((x): x is string => !!x))];
  const recs = recIds.length ? await db.record.findMany({ where: { id: { in: recIds }, workspaceId: survey.workspaceId }, select: { id: true, title: true, objectKey: true } }) : [];
  const title = new Map(recs.map((r) => [r.id, r]));
  const npsVals = done.map((r) => r.nps).filter((x): x is number => x != null);
  const questions = questionsOf(survey);
  return {
    sent: invites.length,
    submitted: done.length,
    invitedSubmitted: invites.filter((r) => r.submittedAt).length,
    responseRate: invites.length ? Math.round((invites.filter((r) => r.submittedAt).length / invites.length) * 100) : null,
    nps: npsScore(npsVals),
    breakdown: npsBreakdown(npsVals),
    avgRating: avgRating(done.map((r) => r.rating).filter((x): x is number => x != null)),
    trend: weeklyTrend(done.map((r) => ({ at: r.submittedAt!, nps: r.nps })), 8),
    questions: questionStats(questions, done.map((r) => parseJson<Answers>(r.answersJson, {}))),
    responses: done.slice(0, 200).map((r) => {
      const rec = r.recordId ? title.get(r.recordId) : undefined;
      return { id: r.id, nps: r.nps, rating: r.rating, comment: r.comment, at: r.submittedAt!.toISOString(), channel: r.channel, recordId: rec?.id ?? null, customer: rec?.title ?? "", objectKey: rec?.objectKey ?? "contacts", bucket: bucketOf(r) };
    }),
  };
}

export type SurveyReport = Awaited<ReturnType<typeof surveyReport>>;
