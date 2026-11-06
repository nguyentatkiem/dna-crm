// Chấm điểm chất lượng chăm sóc một hội thoại 0–100 bằng luật (thuần, có test).
import { businessMs, type WorkingHours } from "./hours";
import { fold } from "./sentiment-rules";

export type QMsg = { direction: string; text: string; createdAt: Date | number; kind?: string };
export type QConv = { name: string; status: string; sentiment: string };
export type QualityItem = { key: string; label: string; delta: number };
export type QualityResult = { score: number; items: QualityItem[]; firstResponseMs: number | null; unanswered: number };

const QUESTION = /\?|\b(bao nhieu|bn|gia|ship|con khong|con ko|con hang|khi nao|bao gio|o dau|the nao|sao|duoc khong|dc khong|co khong|co ko|nhu nao|tu van|size|mau nao)\b/;
const GREETING = /\b(chao|xin chao|kinh chao|hello|hi|da|vang|alo)\b/;
const CLOSING = /\b(cam on|thank|thanks|chuc|hen gap|a|nhe|mong|rat vui|ho tro them)\b/;

const t = (d: Date | number) => (typeof d === "number" ? d : d.getTime());

/** Tên gọi của khách: chữ cuối của tên ("Nguyễn Thị Lan" → "lan"). Tên chung chung → "". */
export function callName(name: string): string {
  const n = fold(name || "");
  if (!n || ["khach", "khach hang", "facebook user", "nguoi dung"].includes(n)) return "";
  const last = n.split(" ").pop() ?? "";
  return last.length >= 2 ? last : "";
}

/**
 * Luật (bắt đầu 100 điểm, trừ dần):
 * - Phản hồi đầu tiên (trong giờ làm việc): ≤5 phút 0, ≤15 phút −5, ≤60 phút −15, lâu hơn −25; không trả lời −40.
 * - Câu hỏi của khách chưa được trả lời (phiên cuối chưa có phản hồi): −8 mỗi câu, tối đa −24.
 * - Không chào hỏi ở tin đầu −5; không cảm ơn/kết thúc lịch sự ở tin cuối −5; không gọi tên khách (khi biết tên) −5.
 * - Chưa xử lý xong mà tin cuối là của khách −10; khách tiêu cực chưa giải quyết −15.
 */
export function scoreConversation(conv: QConv, msgs: QMsg[], wh: WorkingHours): QualityResult {
  const list = msgs.filter((m) => m.direction === "in" || m.direction === "out").sort((a, b) => t(a.createdAt) - t(b.createdAt));
  const items: QualityItem[] = [];
  const add = (key: string, label: string, delta: number) => delta && items.push({ key, label, delta });
  const firstIn = list.find((m) => m.direction === "in");
  const outs = list.filter((m) => m.direction === "out");
  let firstResponseMs: number | null = null;
  if (firstIn) {
    const reply = list.find((m) => m.direction === "out" && t(m.createdAt) >= t(firstIn.createdAt));
    if (!reply) add("no_reply", "Chưa trả lời khách", -40);
    else {
      firstResponseMs = businessMs(firstIn.createdAt, reply.createdAt, wh);
      const min = firstResponseMs / 60000;
      if (min > 60) add("slow", "Phản hồi đầu tiên chậm hơn 60 phút (trong giờ làm)", -25);
      else if (min > 15) add("slow", "Phản hồi đầu tiên chậm hơn 15 phút", -15);
      else if (min > 5) add("slow", "Phản hồi đầu tiên chậm hơn 5 phút", -5);
    }
  }
  // Phiên cuối: các tin khách sau tin trả lời cuối cùng.
  const lastOutAt = outs.length ? t(outs[outs.length - 1].createdAt) : -Infinity;
  const tail = list.filter((m) => m.direction === "in" && t(m.createdAt) > lastOutAt);
  const unanswered = outs.length ? tail.filter((m) => QUESTION.test(fold(m.text))).length : 0;
  if (unanswered) add("unanswered", `${unanswered} câu hỏi của khách chưa được trả lời`, -Math.min(24, unanswered * 8));
  if (outs.length) {
    if (!GREETING.test(fold(outs[0].text))) add("greeting", "Tin đầu chưa chào khách", -5);
    if (!CLOSING.test(fold(outs[outs.length - 1].text))) add("closing", "Tin cuối chưa cảm ơn / kết thúc lịch sự", -5);
    const nm = callName(conv.name);
    if (nm && !outs.some((m) => new RegExp(`\\b${nm}\\b`).test(fold(m.text)))) add("name", "Chưa gọi tên khách", -5);
  }
  if (conv.status !== "done" && list.length && list[list.length - 1].direction === "in" && outs.length) add("open", "Chưa xử lý xong, khách đang chờ", -10);
  if (conv.sentiment === "negative" && conv.status !== "done") add("negative", "Khách không hài lòng, chưa giải quyết", -15);
  const score = Math.max(0, Math.min(100, 100 + items.reduce((s, i) => s + i.delta, 0)));
  return { score, items, firstResponseMs, unanswered };
}

export function qualityNoteFromRules(r: QualityResult): string {
  if (!r.items.length) return "Chăm sóc tốt: phản hồi nhanh, lịch sự, không bỏ sót câu hỏi.";
  return `Cần cải thiện: ${r.items.map((i) => `${i.label} (${i.delta})`).join("; ")}.`;
}
