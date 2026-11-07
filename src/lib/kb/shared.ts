// Kiểu, mặc định và luật thuần của kho kiến thức + chatbot (dùng chung client/server, có kiểm thử).
import { z } from "zod";
import { fold, looksLikeQuestion, maskPII, parseTags } from "./text";

export const BOT_AUTHOR = "Trợ lý tự động";
export const BOT_PREF = "kbBot";
export const BOT_OFF_PREF = "kbBotOff";
/** Ghi chú nội bộ bot để lại khi chuyển nhân viên (nhận diện để chỉ chuyển một lần). */
export const HANDOFF_NOTE = "Bot đã chuyển cho nhân viên";

export const KB_KINDS = ["faq", "doc", "policy", "product", "conversation"] as const;
export type KbKindKey = (typeof KB_KINDS)[number];
export const KIND_LABEL: Record<KbKindKey, string> = { faq: "Câu hỏi thường gặp", doc: "Tài liệu", policy: "Chính sách", product: "Sản phẩm", conversation: "Từ hội thoại" };

export type KbDocDTO = { id: string; kind: KbKindKey; title: string; content: string; tags: string[]; source: string; active: boolean; uses: number; updatedAt: string; createdBy: string };

export type BotMode = "off_hours" | "always" | "first_message";
export const BOT_MODE_LABEL: Record<BotMode, string> = {
  off_hours: "Chỉ ngoài giờ làm việc",
  always: "Luôn trả lời (khi chưa ai phụ trách)",
  first_message: "Chỉ tin nhắn đầu tiên của khách",
};

export const BotPrefSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["off_hours", "always", "first_message"]).default("off_hours"),
  channels: z.array(z.string().max(30)).max(10).default(["messenger", "zalo"]),
  minConfidence: z.number().min(0).max(1).default(0.75),
  maxRepliesPerConversation: z.number().int().min(1).max(20).default(3),
  handoffKeywords: z.array(z.string().max(60)).max(40).default(["gặp nhân viên", "người thật", "nhân viên tư vấn", "gọi cho tôi", "gọi lại", "khiếu nại", "quản lý"]),
  greeting: z.string().max(500).default(""),
  handoffMessage: z.string().max(500).default("Dạ em đã ghi nhận câu hỏi, nhân viên tư vấn sẽ phản hồi anh/chị sớm nhất có thể ạ."),
  disclose: z.boolean().default(true),
  disclosePrefix: z.string().max(60).default("🤖 Trợ lý tự động: "),
  /** Trả lời công khai dưới bình luận (mặc định không: bot chỉ nhắn tin riêng). */
  allowComments: z.boolean().default(false),
});
export type BotPref = z.infer<typeof BotPrefSchema>;
export const BOT_DEFAULT: BotPref = BotPrefSchema.parse({});

/** Chuẩn hoá cài đặt đọc từ Pref (giá trị hỏng → mặc định từng trường). */
export function normBotPref(v: unknown): BotPref {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const shape = BotPrefSchema.shape;
  for (const k of Object.keys(shape) as (keyof typeof shape)[]) {
    const r = shape[k].safeParse(o[k]);
    out[k] = r.success ? r.data : BOT_DEFAULT[k];
  }
  return out as BotPref;
}

/* ───────────── Luật bật/tắt bot (thuần) ───────────── */

export type GateInput = {
  pref: BotPref;
  channel: string;
  kind: string; // inbox | comment
  assignee: string;
  sentiment: string;
  text: string;
  inWorkingHours: boolean;
  offForConversation: boolean;
  /** Số tin khách đã gửi trong hội thoại (kể cả tin này). */
  inboundCount: number;
  /** Số lần bot đã trả lời kể từ lần nhân viên trả lời gần nhất. */
  botRepliesSinceStaff: number;
  /** Phút kể từ lần nhân viên (người) trả lời gần nhất; null = chưa có. */
  minutesSinceStaffReply: number | null;
  /** Đã chuyển nhân viên trong 24 giờ qua mà chưa có nhân viên trả lời. */
  handoffPending: boolean;
};
export type GateResult = { go: true } | { go: false; reason: string; handoff?: boolean };

/** Khách đòi gặp người thật? (so khớp không dấu với từ khoá chuyển nhân viên). */
export function wantsHuman(text: string, keywords: string[]): boolean {
  const t = ` ${fold(text).replace(/\s+/g, " ")} `;
  return keywords.some((k) => {
    const f = fold(k).trim();
    return f.length > 1 && t.includes(f);
  });
}

/** Quyết định bot có được xét trả lời tin này không. Thứ tự lý do ổn định để hiện trong sân thử. */
export function botGate(g: GateInput): GateResult {
  const p = g.pref;
  if (!p.enabled) return { go: false, reason: "Bot đang tắt" };
  if (g.offForConversation) return { go: false, reason: "Đã tắt bot cho hội thoại này" };
  if (g.kind === "comment" && !p.allowComments) return { go: false, reason: "Không tự trả lời công khai dưới bình luận" };
  if (p.channels.length && !p.channels.includes(g.channel)) return { go: false, reason: `Kênh ${g.channel} không bật bot` };
  if (!g.text.trim()) return { go: false, reason: "Tin không có chữ" };
  if (g.handoffPending) return { go: false, reason: "Đã chuyển nhân viên, chờ người trả lời" };
  if (g.assignee && g.inWorkingHours) return { go: false, reason: "Đã có người phụ trách và đang trong giờ làm việc" };
  if (g.minutesSinceStaffReply != null && g.minutesSinceStaffReply < 15) return { go: false, reason: "Nhân viên vừa trả lời trong 15 phút qua" };
  if (p.mode === "off_hours" && g.inWorkingHours) return { go: false, reason: "Đang trong giờ làm việc (bot chỉ trả lời ngoài giờ)" };
  if (p.mode === "first_message" && g.inboundCount > 1) return { go: false, reason: "Không phải tin nhắn đầu tiên của khách" };
  // Từ đây bot đang "trực": các trường hợp cần người thì báo chuyển nhân viên (một lần).
  if (g.sentiment === "negative") return { go: false, reason: "Khách đang bức xúc — để nhân viên xử lý", handoff: true };
  if (wantsHuman(g.text, p.handoffKeywords)) return { go: false, reason: "Khách muốn gặp nhân viên", handoff: true };
  if (g.botRepliesSinceStaff >= p.maxRepliesPerConversation) return { go: false, reason: `Bot đã trả lời đủ ${p.maxRepliesPerConversation} lần`, handoff: true };
  return { go: true };
}

/** Thêm tiền tố công khai "🤖 Trợ lý tự động: " (không thêm hai lần). */
export function withDisclose(text: string, pref: Pick<BotPref, "disclose" | "disclosePrefix">): string {
  const t = text.trim();
  if (!pref.disclose) return t;
  const pre = pref.disclosePrefix || BOT_DEFAULT.disclosePrefix;
  return t.startsWith(pre.trim()) ? t : `${pre}${t}`;
}

/* ───────────── CSV câu hỏi thường gặp ───────────── */

export const FAQ_CSV_HEADER = ["Câu hỏi", "Trả lời", "Thẻ"];

/** Hàng CSV → FAQ. Nhận diện cột theo tiêu đề (có/không dấu), mặc định cột 1 = hỏi, 2 = đáp, 3 = thẻ. */
export function rowsToFaq(rows: string[][]): { title: string; content: string; tags: string[] }[] {
  if (!rows.length) return [];
  const head = rows[0].map((h) => fold(h).trim());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || (n.length >= 5 && h.startsWith(n))));
  let qi = find("cau hoi", "hoi", "question", "q");
  let ai = find("tra loi", "dap", "answer", "a");
  let ti = find("the", "tag", "tags");
  const hasHeader = qi >= 0 || ai >= 0;
  if (qi < 0) qi = 0;
  if (ai < 0) ai = 1;
  if (ti < 0) ti = rows[0].length > 2 ? 2 : -1;
  const out: { title: string; content: string; tags: string[] }[] = [];
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const title = (r[qi] ?? "").trim().slice(0, 300);
    const content = (r[ai] ?? "").trim().slice(0, 5000);
    if (!title || !content) continue;
    out.push({ title, content, tags: ti >= 0 ? parseTags(r[ti] ?? "") : [] });
  }
  return out;
}

/* ───────────── Học từ hội thoại (không AI) ───────────── */

/** Tin cảm ơn/kết thúc — không phải câu hỏi hay câu trả lời có nội dung. */
const THANKS = /^(ok|oke|okie|vang|cam on|thanks|thank|tks|hen gap|chao)\b/;

export type LearnMsg = { direction: string; text: string; author: string; at: number };
export type LearnPair = { question: string; answer: string; conversationId: string };

/**
 * Cặp hỏi–đáp đơn giản: tin khách có vẻ là câu hỏi → tin trả lời kế tiếp của nhân viên (không phải bot, trong 24 giờ).
 * Cả hai đều đã che SĐT/email/địa chỉ. Bỏ câu trả lời quá ngắn ("dạ", "ok").
 */
export function heuristicPairs(conversationId: string, msgs: LearnMsg[], max = 5): LearnPair[] {
  const out: LearnPair[] = [];
  const sorted = [...msgs].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length && out.length < max; i++) {
    const m = sorted[i];
    if (m.direction !== "in" || m.text.trim().length < 6 || !looksLikeQuestion(m.text)) continue;
    // Gom các tin khách liền nhau thành một câu hỏi.
    let q = m.text.trim();
    let j = i + 1;
    while (j < sorted.length && sorted[j].direction === "in" && !THANKS.test(fold(sorted[j].text).trim())) {
      q += ` ${sorted[j].text.trim()}`;
      j++;
    }
    while (j < sorted.length && sorted[j].direction === "note") j++;
    const a = sorted[j];
    if (!a || a.direction !== "out" || a.author === BOT_AUTHOR || a.at - m.at > 864e5) continue;
    const answer = a.text.trim();
    if (answer.length < 15 || THANKS.test(fold(answer).replace(/^da\s+/, "").trim())) continue;
    out.push({ question: maskPII(q).slice(0, 300), answer: maskPII(answer).slice(0, 1500), conversationId });
    i = j;
  }
  return out;
}
