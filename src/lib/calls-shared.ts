// Dùng được cả ở trình duyệt (không import node:fs).
export const OUTCOMES = [
  { key: "connected", label: "Nghe máy, đã tư vấn", color: "blue" },
  { key: "appointment", label: "Đặt được lịch hẹn", color: "purple" },
  { key: "won", label: "Chốt được", color: "green" },
  { key: "callback", label: "Hẹn gọi lại", color: "orange" },
  { key: "no_answer", label: "Không nghe máy", color: "gray" },
  { key: "busy", label: "Máy bận / thuê bao", color: "sky" },
  { key: "not_interested", label: "Không có nhu cầu", color: "red" },
  { key: "wrong", label: "Sai số", color: "berry" },
] as const;
export type OutcomeKey = (typeof OUTCOMES)[number]["key"];
export const POSITIVE = new Set<string>(["appointment", "won"]);
export const TALKED = new Set<string>(["connected", "appointment", "won", "callback", "not_interested"]);
export const outcomeOf = (k: string) => OUTCOMES.find((o) => o.key === k) ?? OUTCOMES[0];

export const scoreColor = (n: number | null) => (n == null ? "#c4c4c4" : n >= 80 ? "#00c875" : n >= 60 ? "#fdab3d" : "#df2f4a");

// ---------------- Tách giọng & cảm xúc (luật, chạy được cả trình duyệt) ----------------

export type Speaker = "NV" | "KH";
export type Segment = { start: number; end: number; speaker: Speaker; text: string; sentiment: -1 | 0 | 1 };
/** Đoạn thô từ máy chủ chép lời: speaker là nhãn của diarization (SPEAKER_00...) hoặc rỗng. */
export type RawSegment = { start: number; end: number; text: string; speaker?: string };

const LABEL = /^\s*(NV|KH|Nhân viên|Nhan vien|Khách hàng|Khách|Khach|Sale|Tư vấn|Agent|Customer|Client)\s*[:：\-–]\s*/i;
const AGENT_LABEL = /^(nv|nhân viên|nhan vien|sale|tư vấn|agent)$/i;
const NV_MARK = ["em chào", "bên em", "dạ em", "em là", "em gọi", "em gửi", "em đặt", "em tư vấn", "em xin", "em giữ", "em hiểu", "anh/chị", "anh chị", "cho em hỏi", "bên mình đang"];

const POS_WORDS = ["tốt", "ok", "oke", "được đó", "được em", "được rồi", "nghe được", "hay đó", "hay quá", "cảm ơn", "hợp lý", "ưng", "thích", "đồng ý", "chốt", "đăng ký", "tuyệt", "yên tâm", "hấp dẫn", "rõ rồi", "vậy được"];
const NEG_WORDS = ["đắt", "giá cao", "mắc", "bận", "lừa", "không cần", "chưa cần", "không có nhu cầu", "không quan tâm", "không muốn", "phiền", "tốn", "sợ", "không tin", "ai đấy", "để sau", "suy nghĩ", "không được", "chán", "tệ", "khó chịu", "spam"];

/** Cảm xúc một câu theo từ điển: 1 tích cực, -1 tiêu cực, 0 trung lập. */
export function sentimentOf(text: string): -1 | 0 | 1 {
  let t = ` ${text.toLowerCase()} `;
  let neg = 0;
  for (const w of NEG_WORDS) if (t.includes(w)) {
    neg++;
    t = t.split(w).join(" ");
  }
  // "thôi" đầu câu là từ chối ("Thôi chị bận"), cuối câu thường chỉ là "chỉ" ("vài triệu thôi").
  if (/(^|[.,!]\s*)thôi\b|thôi (chị|em|anh|khỏi|không|để|nhé|bỏ)/.test(text.toLowerCase().trim())) neg++;
  let pos = 0;
  for (const w of POS_WORDS) if (t.includes(w)) pos++;
  if (/(^|\s)(ừ|vâng|dạ)\s+(được|ok)/.test(text.toLowerCase())) pos++;
  return pos > neg ? 1 : neg > pos ? -1 : 0;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Tách câu cho bản chép lời không có nhãn người nói. */
function sentences(text: string) {
  return text
    .split(/(?<=[.?!…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const isAgentLine = (s: string) => {
  const t = s.toLowerCase();
  return NV_MARK.some((m) => t.includes(m));
};

/** Gán thời gian ước lượng theo số từ khi không có mốc thật (~2,6 từ/giây). */
function timeline(items: { speaker: Speaker; text: string }[], durationSec: number): Segment[] {
  const total = items.reduce((s, x) => s + words(x.text), 0) || 1;
  const span = durationSec > 0 ? durationSec : total / 2.6;
  let at = 0;
  return items.map((x) => {
    const len = (words(x.text) / total) * span;
    const seg = { start: Math.round(at * 10) / 10, end: Math.round((at + len) * 10) / 10, speaker: x.speaker, text: x.text, sentiment: sentimentOf(x.text) };
    at += len;
    return seg;
  });
}

/** Đoán người nói từng câu bằng luật: câu có "em chào", "bên em", "dạ em"... là NV, còn lại xen kẽ. */
export function guessSpeakers(lines: string[]): Speaker[] {
  const out: Speaker[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isAgentLine(lines[i])) out.push("NV");
    else if (i === 0) out.push("NV");
    else out.push(out[i - 1] === "NV" ? "KH" : "NV");
  }
  return out;
}

/** Từ đoạn thô có nhãn diarization: người nói nhiều nhất trong 30 giây đầu (thường là NV chào trước) là NV. */
export function labelDiarized(raw: RawSegment[]): Segment[] {
  const early = new Map<string, number>();
  for (const s of raw) if (s.speaker && s.start < 30) early.set(s.speaker, (early.get(s.speaker) ?? 0) + words(s.text) + (isAgentLine(s.text) ? 20 : 0));
  const agent = [...early.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? raw[0]?.speaker;
  return raw.map((s) => ({ start: s.start, end: s.end, speaker: s.speaker === agent ? "NV" : "KH", text: s.text.trim(), sentiment: sentimentOf(s.text) }));
}

/**
 * Dựng hội thoại theo người nói, không cần AI:
 * - Bản chép lời dạng "NV: ...\nKH: ..." → theo nhãn.
 * - Đoạn thô từ STT có speaker → labelDiarized; không có speaker → đoán theo luật, giữ mốc thời gian thật.
 * - Văn bản trơn → tách câu, đoán người nói, ước lượng thời gian.
 */
export function buildSegments(transcript: string, durationSec: number, raw?: RawSegment[] | null): Segment[] {
  if (raw?.length) {
    if (raw.some((s) => s.speaker)) return labelDiarized(raw);
    const who = guessSpeakers(raw.map((s) => s.text));
    return raw.map((s, i) => ({ start: s.start, end: s.end, speaker: who[i], text: s.text.trim(), sentiment: sentimentOf(s.text) }));
  }
  const lines = transcript.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (hasSpeakerLabels(transcript)) {
    const items: { speaker: Speaker; text: string }[] = [];
    for (const l of lines) {
      const m = l.match(LABEL);
      if (m) items.push({ speaker: AGENT_LABEL.test(m[1]) ? "NV" : "KH", text: l.slice(m[0].length).trim() });
      else if (items.length) items[items.length - 1].text += " " + l;
    }
    return timeline(items.filter((x) => x.text), durationSec);
  }
  const ss = sentences(transcript);
  const who = guessSpeakers(ss);
  return timeline(ss.map((text, i) => ({ speaker: who[i], text })), durationSec);
}

/** Cảm xúc khách 0–100: trung bình các câu của KH, câu về cuối nặng ký hơn (kết thúc cuộc gọi quan trọng hơn). */
export function customerSentiment(segs: Segment[]): number | null {
  const kh = segs.filter((s) => s.speaker === "KH");
  if (!kh.length) return null;
  let sum = 0;
  let wsum = 0;
  kh.forEach((s, i) => {
    const w = 1 + i / kh.length;
    sum += s.sentiment * w;
    wsum += w;
  });
  return Math.round(50 + 50 * (sum / wsum));
}

const QUESTION = /\?|(không ạ|chưa ạ|được không|thế nào|bao nhiêu|khi nào|ở đâu|vì sao|tại sao|như thế nào|nào ạ|gì ạ|gì không|phải không)[\s.,!]*$/i;

/** Tỉ lệ nói NV/KH (theo số từ) và số câu hỏi NV đặt ra. Tốt khi NV nói 40–60%. */
export function talkStats(segs: Segment[]) {
  let nv = 0;
  let kh = 0;
  let questions = 0;
  for (const s of segs) {
    const n = words(s.text);
    if (s.speaker === "NV") {
      nv += n;
      questions += s.text.split(/(?<=[.?!])\s+/).filter((x) => QUESTION.test(x.trim())).length;
    } else kh += n;
  }
  const ratio = nv + kh ? Math.round((nv / (nv + kh)) * 100) : null;
  return { nvWords: nv, khWords: kh, ratio, questions, good: ratio != null && ratio >= 40 && ratio <= 60 };
}

/** Bản chép lời đã ghi rõ người nói ("NV: ...", "KH: ...") hay chưa. */
export function hasSpeakerLabels(transcript: string) {
  const lines = transcript.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.length > 1 && lines.filter((l) => LABEL.test(l)).length >= lines.length * 0.6;
}

/** Đọc segmentsJson đã lưu; rỗng thì dựng lại từ bản chép lời bằng luật. */
export function segmentsOf(call: { segmentsJson: string; transcript: string; durationSec: number }): Segment[] {
  if (call.segmentsJson) {
    try {
      const v = JSON.parse(call.segmentsJson) as unknown;
      if (Array.isArray(v) && v.length) {
        if (v.every((s) => s && (s.speaker === "NV" || s.speaker === "KH"))) return v as Segment[];
        return buildSegments(call.transcript, call.durationSec, v as RawSegment[]);
      }
    } catch {
      // bỏ qua, dựng lại bên dưới
    }
  }
  return call.transcript.trim() ? buildSegments(call.transcript, call.durationSec) : [];
}
