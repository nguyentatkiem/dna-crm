import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Call } from "@prisma/client";
import { db, parseJson } from "./db";
import { ai, MODEL } from "./ai";
import type { WorkspaceConfig } from "./config/schema";
import { loadConfig } from "./sources/ingest";

import { POSITIVE, TALKED, outcomeOf, buildSegments, customerSentiment, hasSpeakerLabels, type RawSegment, type Segment } from "./calls-shared";
import { detectObjections, objectionLibrary } from "./objections";
export { OUTCOMES, POSITIVE, TALKED, outcomeOf, type OutcomeKey, type Segment, type RawSegment } from "./calls-shared";

export type Criterion = { key: string; label: string; weight: number; guide: string; keywords: string[] };
export type CriterionScore = { key: string; score: number; evidence: string; tip: string };
export type CallScore = {
  total: number;
  criteria: CriterionScore[];
  summary: string;
  strengths: string[];
  improvements: string[];
  objections: string[];
  sentiment: "tich_cuc" | "trung_lap" | "tieu_cuc";
  nextAction: string;
  source: "ai" | "rules";
  /** Cảm xúc khách 0–100 (cũng lưu ở Call.sentiment). */
  customerSentiment?: number | null;
};

/** Phiếu chấm mặc định theo các bước bán hàng (Mở đầu → Khai thác → Tư vấn → Xử lý từ chối → Chốt). Tổng trọng số 100. */
export function defaultCriteria(cfg: WorkspaceConfig): Criterion[] {
  const deal = cfg.terminology.deal.toLowerCase();
  return [
    { key: "mo_dau", label: "Mở đầu & xưng danh", weight: 10, guide: "Chào, xưng tên và tên doanh nghiệp, hỏi khách có tiện nghe máy, nói lý do gọi.", keywords: ["chào", "em là", "bên", "tiện nghe", "làm phiền"] },
    { key: "khai_thac", label: "Khai thác nhu cầu", weight: 25, guide: "Hỏi câu hỏi mở về nhu cầu, hoàn cảnh, ngân sách, thời gian; lắng nghe, tóm tắt lại.", keywords: ["anh chị đang", "nhu cầu", "ngân sách", "khi nào", "mong muốn", "quan tâm", "hiện tại"] },
    { key: "tu_van", label: `Tư vấn đúng ${deal}`, weight: 20, guide: "Gợi ý sản phẩm/dịch vụ khớp nhu cầu vừa hỏi, nói lợi ích cụ thể thay vì liệt kê tính năng.", keywords: ["phù hợp", "lợi ích", "giúp", "gói", "ưu đãi", "hiệu quả", "cam kết"] },
    { key: "tu_choi", label: "Xử lý từ chối", weight: 20, guide: "Ghi nhận băn khoăn (giá, thời gian, hỏi người nhà...), giải thích, đưa bằng chứng, không tranh cãi.", keywords: ["em hiểu", "băn khoăn", "thật ra", "nhiều khách", "đảm bảo", "yên tâm"] },
    { key: "chot", label: "Chốt bước tiếp theo", weight: 20, guide: "Đề nghị hành động rõ: đặt lịch, gửi báo giá, chốt đơn; xác nhận thời gian cụ thể.", keywords: ["đặt lịch", "chốt", "giữ chỗ", "gửi báo giá", "hẹn", "thứ", "giờ", "xác nhận"] },
    { key: "thai_do", label: "Thái độ & ngôn ngữ", weight: 5, guide: "Lịch sự, dạ thưa, không ngắt lời, giọng tích cực, kết thúc có cảm ơn.", keywords: ["dạ", "vâng", "cảm ơn", "ạ"] },
  ];
}

export function defaultScript(cfg: WorkspaceConfig) {
  const c = cfg.terminology.contact.toLowerCase();
  return `1. MỞ ĐẦU
"Dạ em chào anh/chị, em là ... bên ${cfg.businessName}. Anh/chị cho em xin 2 phút được không ạ?"

2. LÝ DO GỌI
"Em thấy anh/chị vừa để lại thông tin quan tâm bên em, em gọi để tư vấn kỹ hơn cho mình ạ."

3. KHAI THÁC NHU CẦU (hỏi, đừng giới thiệu vội)
- Hiện tại anh/chị đang gặp vấn đề gì / mong muốn điều gì?
- Mình dự định khi nào bắt đầu? Ngân sách dự kiến khoảng bao nhiêu?
- Ai cùng quyết định với anh/chị?

4. TƯ VẤN
Tóm tắt lại nhu cầu của ${c}, rồi gợi ý 1 lựa chọn phù hợp nhất kèm 2 lợi ích cụ thể.

5. XỬ LÝ TỪ CHỐI
- "Giá cao": "Dạ em hiểu ạ. Nhiều anh chị lúc đầu cũng băn khoăn như vậy, nhưng ..."
- "Để suy nghĩ": "Dạ vâng, anh/chị còn băn khoăn ở điểm nào để em gửi thêm thông tin ạ?"

6. CHỐT
"Em giữ cho mình lịch vào [thứ/giờ] nhé ạ?" → xác nhận lại thời gian, cảm ơn.`;
}

export async function getScorecard(workspaceId: string, cfg?: WorkspaceConfig | null) {
  const cur = await db.scorecard.findFirst({ where: { workspaceId, isActive: true }, orderBy: { version: "desc" } });
  if (cur) return { ...cur, criteria: parseJson<Criterion[]>(cur.criteriaJson, []) };
  const c = cfg ?? (await loadConfig(workspaceId));
  if (!c) throw new Error("Workspace chưa điền DNA");
  const created = await db.scorecard.create({
    data: { workspaceId, version: 1, criteriaJson: JSON.stringify(defaultCriteria(c)), scriptText: defaultScript(c), isActive: true, note: "Phiếu chấm mặc định" },
  });
  return { ...created, criteria: defaultCriteria(c) };
}

export const UPLOAD_DIR = path.join(process.cwd(), "uploads", "calls");

/**
 * Chép lời ghi âm. Hỗ trợ 2 kiểu:
 * - Máy chủ chuẩn OpenAI /v1/audio/transcriptions: speaches (faster-whisper) chạy trên máy, whisper.cpp server, whisperX... → TRANSCRIBE_BASE_URL.
 *   Yêu cầu verbose_json để có mốc thời gian từng đoạn; máy chủ có tách người nói (diarization) thì trả thêm speaker.
 * - FPT.AI Speech to Text → FPT_AI_API_KEY.
 * Không cấu hình gì thì trả null: người dùng dán bản chép lời bằng tay.
 */
export async function transcribeDetailed(file: Buffer, filename: string): Promise<{ text: string; segments: RawSegment[] | null } | null> {
  const base = process.env.TRANSCRIBE_BASE_URL?.replace(/\/$/, "");
  if (base) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file)]), filename);
    form.append("model", process.env.TRANSCRIBE_MODEL || "Systran/faster-whisper-large-v3");
    form.append("language", "vi");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const res = await fetch(`${base}/v1/audio/transcriptions`, {
      method: "POST",
      headers: process.env.TRANSCRIBE_API_KEY ? { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` } : {},
      body: form,
    });
    if (!res.ok) throw new Error(`Máy chủ chép lời báo lỗi ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { text?: string; segments?: { start?: number; end?: number; text?: string; speaker?: string | number }[] };
    const segments = (j.segments ?? [])
      .filter((x) => x.text?.trim())
      .map((x) => ({ start: Number(x.start) || 0, end: Number(x.end) || 0, text: String(x.text).trim(), speaker: x.speaker != null ? String(x.speaker) : undefined }));
    const text = j.text?.trim() || segments.map((x) => x.text).join(" ");
    return text ? { text, segments: segments.length ? segments : null } : null;
  }
  if (process.env.FPT_AI_API_KEY) {
    const res = await fetch("https://api.fpt.ai/hmi/asr/general", { method: "POST", headers: { api_key: process.env.FPT_AI_API_KEY }, body: new Uint8Array(file) });
    const j = (await res.json().catch(() => ({}))) as { status?: number; message?: string; hypotheses?: { utterance: string }[] };
    if (j.status !== 0) throw new Error(`FPT.AI báo lỗi: ${j.message ?? res.status}`);
    const text = (j.hypotheses ?? []).map((h) => h.utterance).join(" ").trim();
    return text ? { text, segments: null } : null;
  }
  return null;
}

export async function transcribe(file: Buffer, filename: string): Promise<string | null> {
  return (await transcribeDetailed(file, filename))?.text ?? null;
}

export const sttConfigured = () => !!(process.env.TRANSCRIBE_BASE_URL || process.env.FPT_AI_API_KEY);

export async function saveRecording(callId: string, file: File) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = (file.name.match(/\.(mp3|wav|m4a|ogg|webm|aac|amr|mp4)$/i)?.[1] ?? "mp3").toLowerCase();
  const name = `${callId}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return { name, buf };
}

const ScoreOut = z.object({
  criteria: z.array(z.object({ key: z.string(), score: z.number().describe("0 đến 10"), evidence: z.string().describe("trích nguyên văn câu trong cuộc gọi, hoặc 'Không có'"), tip: z.string() })),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  objections: z.array(z.string()),
  sentiment: z.enum(["tich_cuc", "trung_lap", "tieu_cuc"]),
  nextAction: z.string(),
  customerSentiment: z.number().describe("cảm xúc của khách cả cuộc, 0 rất tiêu cực, 50 trung lập, 100 rất tích cực"),
  lines: z
    .array(z.object({ i: z.number(), speaker: z.enum(["NV", "KH"]), sentiment: z.number().describe("-1 tiêu cực, 0 trung lập, 1 tích cực") }))
    .describe("mỗi câu đã đánh số: ai nói (NV là nhân viên, KH là khách) và cảm xúc câu đó"),
});

const total = (criteria: Criterion[], scores: CriterionScore[]) =>
  Math.round(criteria.reduce((s, c) => s + (Math.max(0, Math.min(10, scores.find((x) => x.key === c.key)?.score ?? 0)) / 10) * c.weight, 0));

/** Bản luật khi chưa có API key: đếm dấu hiệu theo từ khoá của từng tiêu chí. Thô, nhưng ổn định để học viên thử. */
function ruleScore(transcript: string, outcome: string, criteria: Criterion[], segs: Segment[], cfg: WorkspaceConfig | null): CallScore {
  const t = transcript.toLowerCase();
  const scores = criteria.map((c) => {
    const hits = c.keywords.filter((k) => t.includes(k.toLowerCase()));
    let score = hits.length ? Math.min(9, 3 + hits.length * 2) : 2;
    if (c.key === "chot" && POSITIVE.has(outcome)) score = Math.max(score, 8);
    const sentence = hits.length ? (transcript.split(/(?<=[.?!])\s+/).find((s) => s.toLowerCase().includes(hits[0].toLowerCase())) ?? "") : "";
    return { key: c.key, score, evidence: sentence.slice(0, 160) || "Không có", tip: hits.length >= 2 ? "Giữ cách làm này." : c.guide };
  });
  const weak = [...scores].filter((x) => x.score < 7).sort((a, b) => a.score - b.score).slice(0, 2);
  const strong = [...scores].sort((a, b) => b.score - a.score).slice(0, 2);
  const label = (k: string) => criteria.find((c) => c.key === k)?.label ?? k;
  const lib = objectionLibrary(cfg ?? { businessName: "bên em", terminology: { contact: "Khách", deal: "dịch vụ" } });
  const khText = segs.filter((x) => x.speaker === "KH").map((x) => x.text).join(" ") || transcript;
  const objections = detectObjections(khText, lib).map((o) => o.label);
  const cs = customerSentiment(segs);
  return {
    total: total(criteria, scores),
    criteria: scores,
    summary: `Cuộc gọi ${transcript.split(/\s+/).length} từ, kết quả: ${outcomeOf(outcome).label.toLowerCase()}.`,
    strengths: strong.map((s) => label(s.key)),
    improvements: weak.map((s) => `${label(s.key)}: ${criteria.find((c) => c.key === s.key)?.guide}`),
    objections: objections.map((o) => `Khách băn khoăn: ${o.toLowerCase()}`),
    sentiment: POSITIVE.has(outcome) || (cs ?? 50) >= 65 ? "tich_cuc" : outcome === "not_interested" || (cs ?? 50) <= 35 ? "tieu_cuc" : "trung_lap",
    customerSentiment: cs,
    nextAction: POSITIVE.has(outcome) ? "Gửi tin xác nhận và nhắc lịch trước 1 ngày." : "Gọi lại sau 2–3 ngày, chuẩn bị câu trả lời cho băn khoăn của khách.",
    source: "rules",
  };
}

/** Ví dụ hiệu chỉnh: các cuộc quản lý đã chấm lại lệch nhiều so với AI. Đưa vào prompt để AI chấm sát chuẩn của chủ hơn. */
async function calibration(workspaceId: string) {
  const rows = await db.call.findMany({ where: { workspaceId, reviewScore: { not: null }, aiScore: { not: null } }, orderBy: { reviewedAt: "desc" }, take: 30 });
  return rows
    .filter((r) => Math.abs((r.reviewScore ?? 0) - (r.aiScore ?? 0)) >= 8)
    .slice(0, 4)
    .map((r) => `- Cuộc gọi tóm tắt: "${r.summary}". AI chấm ${r.aiScore}, quản lý chấm lại ${r.reviewScore}. Lý do: ${r.reviewNote || "không ghi"}`)
    .join("\n");
}

/** Call Analyst: chấm cuộc gọi theo phiếu đang dùng, tạo việc huấn luyện nếu điểm thấp. */
export async function scoreCall(call: Call, opts: { rulesOnly?: boolean } = {}): Promise<CallScore | null> {
  if (!call.transcript.trim()) return null;
  const cfg = await loadConfig(call.workspaceId);
  const card = await getScorecard(call.workspaceId, cfg);
  let result: CallScore | null = null;
  // Hội thoại theo người nói: dùng đoạn đã lưu (từ STT hoặc lần chấm trước), không có thì dựng từ bản chép lời.
  const stored = parseJson<(RawSegment | Segment)[] | null>(call.segmentsJson, null);
  const final = !!stored?.length && stored.every((x) => x.speaker === "NV" || x.speaker === "KH");
  const certain = final || hasSpeakerLabels(call.transcript) || !!stored?.some((x) => x.speaker);
  let segs: Segment[] = final ? (stored as Segment[]) : buildSegments(call.transcript, call.durationSec, stored as RawSegment[] | null);
  const numbered = segs.length <= 250 ? segs.map((x, i) => `[${i}] ${certain ? `${x.speaker}: ` : ""}${x.text}`).join("\n") : "";
  const c = opts.rulesOnly ? null : ai();
  if (c && cfg) {
    try {
      const calib = await calibration(call.workspaceId);
      const res = await c.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(ScoreOut) },
        system: `Bạn là quản lý QA telesales của ${cfg.businessName} (ngành ${cfg.industry}). Chấm cuộc gọi của nhân viên theo phiếu chấm, mỗi tiêu chí 0–10, khắt khe nhưng công bằng. Bản chép lời có thể chưa tách người nói và có lỗi nhận dạng giọng nói: hãy suy luận theo ngữ cảnh. Bằng chứng phải trích nguyên văn. Viết tiếng Việt ngắn gọn.`,
        messages: [
          {
            role: "user",
            content: `PHIẾU CHẤM:
${card.criteria.map((x) => `- ${x.key} | ${x.label} (trọng số ${x.weight}): ${x.guide}`).join("\n")}

KỊCH BẢN CHUẨN CỦA DOANH NGHIỆP:
${card.scriptText}
${calib ? `\nCHUẨN CHẤM CỦA QUẢN LÝ (học từ các lần chấm lại trước):\n${calib}\n` : ""}
KẾT QUẢ NHÂN VIÊN GHI: ${outcomeOf(call.outcome).label}${call.note ? `. Ghi chú: ${call.note}` : ""}

BẢN CHÉP LỜI:
${call.transcript.slice(0, 30000)}
${numbered ? `\nCÁC CÂU ĐÃ ĐÁNH SỐ (trả "lines" cho từng câu${certain ? ", giữ người nói đã ghi trừ khi sai rõ ràng" : ": suy luận ai nói, nhân viên thường chào và xưng 'em' trước"}):\n${numbered.slice(0, 20000)}` : ""}`,
          },
        ],
      });
      const out = res.parsed_output;
      if (res.stop_reason !== "refusal" && out) {
        const criteria = card.criteria.map((k) => out.criteria.find((x) => x.key === k.key) ?? { key: k.key, score: 0, evidence: "Không có", tip: k.guide });
        segs = segs.map((x, i) => {
          const l = out.lines.find((y) => y.i === i);
          if (!l) return x;
          return { ...x, speaker: certain ? x.speaker : l.speaker, sentiment: (l.sentiment > 0.3 ? 1 : l.sentiment < -0.3 ? -1 : 0) as Segment["sentiment"] };
        });
        const { lines: _lines, ...rest } = out;
        void _lines;
        result = { ...rest, customerSentiment: Math.max(0, Math.min(100, Math.round(out.customerSentiment))), criteria, total: total(card.criteria, criteria), source: "ai" };
      }
    } catch (e) {
      console.error("[Call Analyst] dùng bản luật vì AI lỗi:", e instanceof Error ? e.message : e);
    }
  }
  result ??= ruleScore(call.transcript, call.outcome, card.criteria, segs, cfg);
  const sentiment = result.customerSentiment ?? customerSentiment(segs);

  await db.call.update({
    where: { id: call.id },
    data: { aiScore: result.total, scoreJson: JSON.stringify(result), summary: result.summary, scorecardVersion: card.version, segmentsJson: segs.length ? JSON.stringify(segs) : "", sentiment },
  });
  if (call.recordId) {
    await db.activity.create({
      data: { recordId: call.recordId, kind: "ai", body: `Call Analyst chấm cuộc gọi của ${call.agentName}: ${result.total}/100. ${result.summary}\nBước tiếp theo: ${result.nextAction}`, author: "Call Analyst" },
    });
  }
  if (result.total < 60) {
    const weakest = [...result.criteria].sort((a, b) => a.score - b.score)[0];
    const label = card.criteria.find((x) => x.key === weakest?.key)?.label ?? "kỹ năng";
    await db.task.create({
      data: { workspaceId: call.workspaceId, recordId: call.recordId, title: `${call.agentName}: nghe lại cuộc gọi ${result.total} điểm, luyện "${label}"`, dueAt: new Date(Date.now() + 2 * 864e5), source: "Call Analyst" },
    });
  }
  await db.agentLog.create({ data: { workspaceId: call.workspaceId, agent: "Call Analyst", message: `Chấm cuộc gọi của ${call.agentName}: ${result.total}/100` } });
  return result;
}

// ---------------- Vòng phản hồi ----------------

export type LessonProposal = { weights: { key: string; weight: number }[]; scriptAdd: string; insights: string[] };

const LessonOut = z.object({
  title: z.string(),
  insights: z.array(z.string()).describe("3-6 nhận định có số liệu"),
  weights: z.array(z.object({ key: z.string(), weight: z.number() })).describe("trọng số mới, tổng 100"),
  scriptAdd: z.string().describe("đoạn bổ sung vào kịch bản: câu mẫu mới, cách xử lý từ chối hay gặp"),
});

export async function teamStats(workspaceId: string, days = 60) {
  const since = new Date(Date.now() - days * 864e5);
  const calls = await db.call.findMany({ where: { workspaceId, startedAt: { gte: since } }, orderBy: { startedAt: "desc" } });
  const card = await getScorecard(workspaceId);
  const scored = calls.filter((c) => c.aiScore != null);
  const avgBy = (list: Call[], key: string) => {
    const v = list.map((c) => parseJson<CallScore | null>(c.scoreJson, null)?.criteria.find((x) => x.key === key)?.score).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const pos = scored.filter((c) => POSITIVE.has(c.outcome));
  const neg = scored.filter((c) => !POSITIVE.has(c.outcome) && TALKED.has(c.outcome));
  const criteria = card.criteria.map((k) => {
    const a = avgBy(pos, k.key);
    const b = avgBy(neg, k.key);
    return { ...k, avgAll: avgBy(scored, k.key), avgWin: a, avgLose: b, gap: a != null && b != null ? a - b : null };
  });
  const reviewed = scored.filter((c) => c.reviewScore != null);
  const drift = reviewed.length ? reviewed.reduce((s, c) => s + Math.abs((c.reviewScore ?? 0) - (c.aiScore ?? 0)), 0) / reviewed.length : null;
  const bias = reviewed.length ? reviewed.reduce((s, c) => s + ((c.reviewScore ?? 0) - (c.aiScore ?? 0)), 0) / reviewed.length : null;
  return { calls, scored, pos, neg, criteria, card, reviewed, drift, bias };
}

/** Rút bài học từ cuộc gọi thắng/thua + điểm quản lý chấm lại → đề xuất trọng số và kịch bản mới (chờ chủ duyệt). */
export async function learnLessons(workspaceId: string) {
  const s = await teamStats(workspaceId);
  if (s.scored.length < 3) throw new Error("Cần ít nhất 3 cuộc gọi đã chấm để rút bài học.");
  const cfg = await loadConfig(workspaceId);
  const fmt = (n: number | null) => (n == null ? "–" : n.toFixed(1));
  const statText = s.criteria.map((k) => `- ${k.key} | ${k.label}: trọng số ${k.weight}, TB ${fmt(k.avgAll)}, cuộc thắng ${fmt(k.avgWin)}, cuộc không thắng ${fmt(k.avgLose)}`).join("\n");

  // Bản luật: dồn trọng số về tiêu chí phân biệt thắng/thua rõ nhất.
  const raw = s.criteria.map((k) => ({ key: k.key, w: k.weight * (1 + Math.max(-0.5, Math.min(0.8, (k.gap ?? 0) / 10))) }));
  const sum = raw.reduce((a, b) => a + b.w, 0) || 1;
  const weights = raw.map((r) => ({ key: r.key, weight: Math.max(5, Math.round((r.w / sum) * 100)) }));
  const fix = 100 - weights.reduce((a, b) => a + b.weight, 0);
  weights.sort((a, b) => b.weight - a.weight)[0].weight += fix;
  const best = [...s.criteria].filter((k) => k.gap != null).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))[0];
  const insights = [
    `${s.scored.length} cuộc gọi đã chấm trong 60 ngày, ${s.pos.length} cuộc ra lịch hẹn/chốt.`,
    best ? `"${best.label}" chênh lệch nhiều nhất giữa cuộc thắng (${fmt(best.avgWin)}) và cuộc không thắng (${fmt(best.avgLose)}).` : "Chưa đủ cuộc thắng/thua để so sánh tiêu chí.",
    s.drift != null ? `AI lệch trung bình ${s.drift.toFixed(1)} điểm so với quản lý (${(s.bias ?? 0) > 0 ? "AI chấm thấp hơn" : "AI chấm cao hơn"}) trên ${s.reviewed.length} cuộc đã chấm lại.` : "Quản lý chưa chấm lại cuộc nào: hãy chấm lại vài cuộc để AI học chuẩn của bạn.",
  ];
  let lesson = { title: `Bài học từ ${s.scored.length} cuộc gọi`, insights, weights, scriptAdd: best ? `LƯU Ý MỚI: tập trung "${best.label}": ${best.guide}` : "" };

  const c = ai();
  if (c && cfg) {
    try {
      const sample = (list: Call[]) => list.slice(0, 6).map((x) => `- [${x.aiScore}${x.reviewScore != null ? `, quản lý ${x.reviewScore}` : ""}] ${outcomeOf(x.outcome).label}: ${x.summary}${x.reviewNote ? ` | Quản lý: ${x.reviewNote}` : ""}`).join("\n");
      const objections = s.scored.flatMap((x) => parseJson<CallScore | null>(x.scoreJson, null)?.objections ?? []).slice(0, 30);
      const res = await c.messages.parse({
        model: MODEL,
        max_tokens: 6000,
        output_config: { effort: "medium", format: zodOutputFormat(LessonOut) },
        system: `Bạn là trưởng phòng telesales của ${cfg.businessName}. Phân tích dữ liệu cuộc gọi thật để rút bài học, đề xuất trọng số phiếu chấm mới (giữ nguyên các key, tổng 100, mỗi tiêu chí ít nhất 5) và đoạn bổ sung kịch bản. Chỉ nói điều có dữ liệu chứng minh. Tiếng Việt.`,
        messages: [
          {
            role: "user",
            content: `THỐNG KÊ TIÊU CHÍ:\n${statText}\n\nĐỘ LỆCH AI/QUẢN LÝ: ${fmt(s.drift)}\n\nCUỘC THẮNG:\n${sample(s.pos)}\n\nCUỘC KHÔNG THẮNG:\n${sample(s.neg)}\n\nTỪ CHỐI HAY GẶP:\n${objections.join("\n")}\n\nKỊCH BẢN HIỆN TẠI:\n${s.card.scriptText}`,
          },
        ],
      });
      const out = res.parsed_output;
      if (res.stop_reason !== "refusal" && out) {
        const keys = new Set(s.card.criteria.map((k) => k.key));
        const w = out.weights.filter((x) => keys.has(x.key));
        const ok = w.length === keys.size && Math.abs(w.reduce((a, b) => a + b.weight, 0) - 100) <= 2;
        lesson = { title: out.title, insights: out.insights, weights: ok ? w : weights, scriptAdd: out.scriptAdd };
      }
    } catch (e) {
      console.error("[Feedback loop] dùng bản luật vì AI lỗi:", e instanceof Error ? e.message : e);
    }
  }
  const proposal: LessonProposal = { weights: lesson.weights, scriptAdd: lesson.scriptAdd, insights: lesson.insights };
  return db.lesson.create({ data: { workspaceId, title: lesson.title, body: lesson.insights.join("\n"), proposalJson: JSON.stringify(proposal) } });
}

/** Chủ duyệt bài học → phiếu chấm phiên bản mới. Cuộc gọi cũ giữ điểm theo phiên bản cũ để so sánh. */
export async function applyLesson(workspaceId: string, lessonId: string) {
  const lesson = await db.lesson.findFirstOrThrow({ where: { id: lessonId, workspaceId } });
  const p = parseJson<LessonProposal | null>(lesson.proposalJson, null);
  if (!p) throw new Error("Bài học không có đề xuất");
  const card = await getScorecard(workspaceId);
  const criteria = card.criteria.map((k) => ({ ...k, weight: p.weights.find((w) => w.key === k.key)?.weight ?? k.weight }));
  await db.$transaction([
    db.scorecard.updateMany({ where: { workspaceId }, data: { isActive: false } }),
    db.scorecard.create({
      data: { workspaceId, version: card.version + 1, criteriaJson: JSON.stringify(criteria), scriptText: (card.scriptText + "\n\n" + (p.scriptAdd ?? "").trim()).trim(), source: "lesson", note: lesson.title, isActive: true },
    }),
    db.lesson.update({ where: { id: lesson.id }, data: { status: "applied" } }),
  ]);
}
