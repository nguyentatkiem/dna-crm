// Chấm điểm khách theo hành vi: luật (Pref "scoring") và hàm tính thuần. Không import server.

export const SCORE_EVENTS = ["email_open", "email_click", "form_submit", "message_in", "call_positive", "quote_viewed", "order_done", "ticket_open", "survey_promoter", "survey_detractor"] as const;
export type ScoreEvent = (typeof SCORE_EVENTS)[number];

export const SCORE_EVENT_LABEL: Record<ScoreEvent, string> = {
  email_open: "Mở email",
  email_click: "Nhấp link trong email",
  form_submit: "Điền form / để lại thông tin",
  message_in: "Nhắn tin đến",
  call_positive: "Cuộc gọi tích cực (đặt lịch, chốt)",
  quote_viewed: "Xem báo giá",
  order_done: "Đơn hàng hoàn tất",
  ticket_open: "Mở phiếu hỗ trợ",
  survey_promoter: "Khảo sát: sẵn lòng giới thiệu (NPS 9–10)",
  survey_detractor: "Khảo sát: không hài lòng (NPS 0–6)",
};

export type ScoringRules = {
  enabled: boolean;
  /** Phần trăm điểm hồ sơ (độ đầy đủ + nguồn) được giữ làm nền. */
  profileWeight: number;
  events: Record<ScoreEvent, number>;
  /** Chỉ đếm hành vi trong chừng này ngày gần nhất. */
  windowDays: number;
  /** Trừ điểm mỗi tuần khách không tương tác. */
  decayPerIdleWeek: number;
};

export const SCORING_DEFAULT: ScoringRules = {
  enabled: true,
  profileWeight: 60,
  events: { email_open: 2, email_click: 5, form_submit: 10, message_in: 3, call_positive: 12, quote_viewed: 8, order_done: 15, ticket_open: -3, survey_promoter: 8, survey_detractor: -10 },
  windowDays: 90,
  decayPerIdleWeek: 2,
};

/** Mỗi loại hành vi cộng/trừ tối đa chừng này điểm, để một khách mở email 50 lần không vọt lên 100. */
export const EVENT_CAP = 30;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Ghép luật đã lưu với mặc định và chặn giá trị lạ. */
export function normalizeRules(r: Partial<ScoringRules> | null | undefined): ScoringRules {
  const ev = { ...SCORING_DEFAULT.events };
  for (const k of SCORE_EVENTS) {
    const v = Number(r?.events?.[k]);
    if (Number.isFinite(v)) ev[k] = clamp(Math.round(v), -50, 50);
  }
  const num = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? clamp(Math.round(Number(v)), lo, hi) : d);
  return {
    enabled: r?.enabled ?? SCORING_DEFAULT.enabled,
    profileWeight: num(r?.profileWeight, SCORING_DEFAULT.profileWeight, 0, 100),
    events: ev,
    windowDays: num(r?.windowDays, SCORING_DEFAULT.windowDays, 7, 365),
    decayPerIdleWeek: num(r?.decayPerIdleWeek, SCORING_DEFAULT.decayPerIdleWeek, 0, 20),
  };
}

export type ScoreCounts = Partial<Record<ScoreEvent, number>>;
export type ScorePart = { key: ScoreEvent; label: string; count: number; points: number };
export type ScoreParts = { score: number; base: number; decay: number; idleWeeks: number; parts: ScorePart[] };

/** Chi tiết điểm: nền hồ sơ + từng hành vi − trừ vì lâu không tương tác, chặn 0–100. */
export function scoreParts(profileScore: number, counts: ScoreCounts, idleDays: number, rules: ScoringRules): ScoreParts {
  if (!rules.enabled) return { score: clamp(Math.round(profileScore), 0, 100), base: Math.round(profileScore), decay: 0, idleWeeks: 0, parts: [] };
  const base = (clamp(profileScore, 0, 100) * rules.profileWeight) / 100;
  const parts: ScorePart[] = [];
  for (const k of SCORE_EVENTS) {
    const count = Math.max(0, Math.floor(counts[k] ?? 0));
    if (!count || !rules.events[k]) continue;
    parts.push({ key: k, label: SCORE_EVENT_LABEL[k], count, points: clamp(count * rules.events[k], -EVENT_CAP, EVENT_CAP) });
  }
  const idleWeeks = Math.max(0, Math.floor((Number.isFinite(idleDays) ? idleDays : 0) / 7));
  const decay = idleWeeks * rules.decayPerIdleWeek;
  const total = base + parts.reduce((s, p) => s + p.points, 0) - decay;
  return { score: clamp(Math.round(total), 0, 100), base: Math.round(base), decay, idleWeeks, parts: parts.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)) };
}

export const computeScore = (profileScore: number, counts: ScoreCounts, idleDays: number, rules: ScoringRules) => scoreParts(profileScore, counts, idleDays, rules).score;

/** Câu giải thích ngắn cho dòng hoạt động khi điểm đổi nhiều. */
export function explainChange(prev: number, p: ScoreParts) {
  const top = p.parts.slice(0, 3).map((x) => `${x.label.toLowerCase()} ×${x.count} (${x.points > 0 ? "+" : ""}${x.points})`);
  if (p.decay) top.push(`${p.idleWeeks} tuần chưa tương tác (−${p.decay})`);
  return `Điểm khách ${p.score > prev ? "tăng" : "giảm"} ${prev} → ${p.score}${top.length ? `: ${top.join(", ")}` : ""}`;
}
