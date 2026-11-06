// Khảo sát: kiểu câu hỏi, chấm NPS, kiểm tra câu trả lời, thống kê. Thuần, dùng được cả client lẫn server.
import { z } from "zod";

export const SURVEY_KINDS = ["nps", "csat", "custom"] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];
export const SURVEY_KIND_LABEL: Record<SurveyKind, string> = { nps: "NPS", csat: "CSAT", custom: "Tuỳ chỉnh" };

export const QUESTION_TYPES = ["nps", "rating", "choice", "multi", "text"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = { nps: "Điểm 0–10 (NPS)", rating: "Sao 1–5", choice: "Chọn một", multi: "Chọn nhiều", text: "Trả lời tự do" };

export type Question = { id: string; type: QuestionType; label: string; options?: string[]; required?: boolean };
export type Answers = Record<string, number | string | string[]>;

export const QuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(QUESTION_TYPES),
  label: z.string().trim().min(1, "Câu hỏi cần có nội dung").max(300),
  options: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  required: z.boolean().optional(),
});
export const QuestionsSchema = z
  .array(QuestionSchema)
  .min(1, "Khảo sát cần ít nhất một câu hỏi")
  .max(30)
  .superRefine((qs, ctx) => {
    const ids = new Set<string>();
    qs.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: "Mã câu hỏi bị trùng" });
      ids.add(q.id);
      if (q.type === "choice" || q.type === "multi") {
        const opts = q.options ?? [];
        if (!opts.length) ctx.addIssue({ code: "custom", path: [i, "options"], message: `Câu “${q.label}” cần ít nhất một lựa chọn` });
        else if (new Set(opts).size !== opts.length) ctx.addIssue({ code: "custom", path: [i, "options"], message: `Câu “${q.label}” có lựa chọn bị trùng` });
      }
    });
  });

export const SURVEY_CHANNELS = ["link", "zalo", "zns", "sms", "email"] as const;
export type SurveyChannel = (typeof SURVEY_CHANNELS)[number];
export const SURVEY_CHANNEL_LABEL: Record<SurveyChannel, string> = { link: "Chỉ tạo link", zalo: "Zalo OA", zns: "Zalo ZNS", sms: "SMS", email: "Email" };

/** Cài đặt khảo sát lưu ở Pref "survey". */
export type SurveyPref = { afterTicketSurveyId: string; afterTicketChannel: SurveyChannel; message: string };
export const SURVEY_PREF_DEFAULT: SurveyPref = { afterTicketSurveyId: "", afterTicketChannel: "link", message: "Chào {ten}, {ten_doanh_nghiep} rất mong nhận góp ý của bạn (1 phút): {link}" };

export type NpsBucket = "promoter" | "passive" | "detractor";
export const NPS_LABEL: Record<NpsBucket, string> = { promoter: "Ủng hộ", passive: "Trung lập", detractor: "Phản đối" };
export const NPS_COLOR: Record<NpsBucket, string> = { promoter: "#00c875", passive: "#fdab3d", detractor: "#e2445c" };

/** 9–10 ủng hộ, 7–8 trung lập, 0–6 phản đối. */
export function npsBucket(score: number): NpsBucket {
  return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
}

/** Điểm NPS = %ủng hộ − %phản đối, làm tròn, trong [-100, 100]. Không có câu trả lời → null. */
export function npsScore(scores: number[]) {
  const s = scores.filter((x) => Number.isFinite(x) && x >= 0 && x <= 10);
  if (!s.length) return null;
  const p = s.filter((x) => x >= 9).length;
  const d = s.filter((x) => x <= 6).length;
  return Math.round(((p - d) / s.length) * 100);
}

/** Đếm số câu trả lời theo nhóm và theo từng điểm 0..10. */
export function npsBreakdown(scores: number[]) {
  const dist = Array.from({ length: 11 }, () => 0);
  const by: Record<NpsBucket, number> = { promoter: 0, passive: 0, detractor: 0 };
  for (const x of scores) {
    if (!Number.isInteger(x) || x < 0 || x > 10) continue;
    dist[x]++;
    by[npsBucket(x)]++;
  }
  return { dist, ...by, total: by.promoter + by.passive + by.detractor };
}

/** Trung bình sao (1–5), một chữ số thập phân. */
export function avgRating(ratings: number[]) {
  const r = ratings.filter((x) => x >= 1 && x <= 5);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null;
}

/** Thứ hai đầu tuần (giờ máy) của một ngày, dạng YYYY-MM-DD. */
export function weekKey(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** NPS theo tuần cho `weeks` tuần gần nhất (tuần không có trả lời: nps null). */
export function weeklyTrend(rows: { at: Date; nps: number | null }[], weeks = 8, now = new Date()) {
  const out: { week: string; label: string; count: number; nps: number | null }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 864e5);
    const k = weekKey(d);
    const [, m, dd] = k.split("-");
    const scores = rows.filter((r) => r.nps != null && weekKey(r.at) === k).map((r) => r.nps!);
    out.push({ week: k, label: `${dd}/${m}`, count: scores.length, nps: npsScore(scores) });
  }
  return out;
}

/** Thống kê từng câu: đếm lựa chọn (choice/multi), phân bố sao (rating), trung bình. */
export function questionStats(questions: Question[], answers: Answers[]) {
  return questions.map((q) => {
    const vals = answers.map((a) => a[q.id]).filter((v) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length));
    if (q.type === "choice" || q.type === "multi") {
      const counts = new Map<string, number>((q.options ?? []).map((o) => [o, 0]));
      for (const v of vals) for (const o of Array.isArray(v) ? v : [String(v)]) counts.set(o, (counts.get(o) ?? 0) + 1);
      return { id: q.id, type: q.type, label: q.label, answered: vals.length, options: [...counts].map(([label, count]) => ({ label, count })) };
    }
    if (q.type === "rating" || q.type === "nps") {
      const max = q.type === "rating" ? 5 : 10;
      const nums = vals.map(Number).filter((n) => Number.isFinite(n));
      const options = Array.from({ length: q.type === "rating" ? 5 : 11 }, (_, i) => {
        const v = q.type === "rating" ? i + 1 : i;
        return { label: String(v), count: nums.filter((n) => n === v).length };
      });
      const avg = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
      return { id: q.id, type: q.type, label: q.label, answered: nums.length, options, avg, max };
    }
    return { id: q.id, type: q.type, label: q.label, answered: vals.length, texts: vals.map(String).slice(0, 50) };
  });
}

/**
 * Kiểm tra và làm sạch câu trả lời theo bộ câu hỏi. Trả { answers, nps, rating, comment } hoặc { error }.
 * nps/rating lấy từ câu đầu tiên đúng loại; comment lấy câu trả lời tự do đầu tiên.
 */
export function cleanAnswers(questions: Question[], raw: Record<string, unknown>): { error: string } | { answers: Answers; nps: number | null; rating: number | null; comment: string } {
  const answers: Answers = {};
  let nps: number | null = null;
  let rating: number | null = null;
  let comment = "";
  for (const q of questions) {
    const v = raw[q.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required) return { error: `Vui lòng trả lời: “${q.label}”` };
      continue;
    }
    if (q.type === "nps" || q.type === "rating") {
      const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
      const [lo, hi] = q.type === "nps" ? [0, 10] : [1, 5];
      if (!Number.isInteger(n) || n < lo || n > hi) return { error: `Điểm chưa hợp lệ ở câu “${q.label}”` };
      answers[q.id] = n;
      if (q.type === "nps" && nps == null) nps = n;
      if (q.type === "rating" && rating == null) rating = n;
    } else if (q.type === "choice") {
      const s = String(v);
      if (!(q.options ?? []).includes(s)) return { error: `Lựa chọn chưa hợp lệ ở câu “${q.label}”` };
      answers[q.id] = s;
    } else if (q.type === "multi") {
      const arr = (Array.isArray(v) ? v : [v]).map(String).filter((s) => (q.options ?? []).includes(s));
      if (!arr.length && q.required) return { error: `Vui lòng trả lời: “${q.label}”` };
      if (arr.length) answers[q.id] = [...new Set(arr)];
    } else {
      const s = String(v).trim().slice(0, 2000);
      if (!s && q.required) return { error: `Vui lòng trả lời: “${q.label}”` };
      if (s) {
        answers[q.id] = s;
        if (!comment) comment = s;
      }
    }
  }
  return { answers, nps, rating, comment };
}

/** Bộ câu hỏi mặc định theo loại khảo sát. */
export function defaultQuestions(kind: SurveyKind): Question[] {
  if (kind === "nps")
    return [
      { id: "q1", type: "nps", label: "Bạn có sẵn lòng giới thiệu chúng tôi cho bạn bè, người thân không?", required: true },
      { id: "q2", type: "text", label: "Điều gì khiến bạn chấm điểm như vậy?" },
    ];
  if (kind === "csat")
    return [
      { id: "q1", type: "rating", label: "Bạn hài lòng với trải nghiệm vừa rồi ở mức nào?", required: true },
      { id: "q2", type: "choice", label: "Bạn hài lòng nhất điều gì?", options: ["Thái độ nhân viên", "Chất lượng dịch vụ", "Thời gian xử lý", "Giá cả"] },
      { id: "q3", type: "text", label: "Góp ý thêm cho chúng tôi" },
    ];
  return [{ id: "q1", type: "text", label: "Bạn muốn góp ý điều gì?", required: true }];
}

export const RATING_LABEL = ["", "Rất không hài lòng", "Chưa hài lòng", "Bình thường", "Hài lòng", "Rất hài lòng"];
