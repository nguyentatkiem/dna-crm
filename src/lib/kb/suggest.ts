// Gợi ý trả lời bám kho kiến thức cho Hộp thư.
import type { Conversation } from "@prisma/client";
import { db } from "../db";
import { ai } from "../ai";
import { askJson } from "./llm";
import { buildSuggestPrompt, kbSuggestions, sanitizeSuggestions, SuggestOut, type ChatLine, type Suggestion } from "./prompt";
import { bumpUses, retrieve, shopVoice } from "./store";

/** N tin gần nhất (không gồm ghi chú nội bộ), cũ → mới. */
export async function recentLines(conversationId: string, n = 12): Promise<ChatLine[]> {
  const rows = await db.message.findMany({ where: { conversationId, direction: { in: ["in", "out"] } }, orderBy: { createdAt: "desc" }, take: n, select: { direction: true, text: true } });
  return rows.reverse().map((m) => ({ direction: m.direction as "in" | "out", text: m.text }));
}

/** Câu hỏi cần trả lời: các tin khách liền nhau ở cuối hội thoại (hoặc tin khách gần nhất). */
export function pendingQuestion(lines: ChatLine[]): string {
  const out: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].direction === "in") out.unshift(lines[i].text);
    else if (out.length) break;
  }
  if (!out.length) {
    const last = [...lines].reverse().find((l) => l.direction === "in");
    if (last) out.push(last.text);
  }
  return out.join(" ").slice(0, 600);
}

export type SuggestResult = { suggestions: Suggestion[]; query: string; aiAvailable: boolean; origin: "ai" | "kb" | "none" };

/** Gợi ý 1–3 câu: có AI (và useAi) → Claude viết theo giọng shop, dẫn nguồn; không thì câu trả lời FAQ khớp nhất. */
export async function suggestFor(conv: Conversation, opts: { useAi?: boolean; query?: string } = {}): Promise<SuggestResult> {
  const lines = await recentLines(conv.id);
  const query = (opts.query ?? pendingQuestion(lines)).trim();
  const aiAvailable = !!ai();
  if (!query) return { suggestions: [], query, aiAvailable, origin: "none" };
  const hits = await retrieve(conv.workspaceId, query, 5);
  if (opts.useAi && aiAvailable) {
    const { system, user } = buildSuggestPrompt(await shopVoice(conv.workspaceId), lines, hits);
    const out = sanitizeSuggestions(await askJson(SuggestOut, system, user, { maxTokens: 1500, tag: "suggest" }), hits);
    if (out.length) return { suggestions: out, query, aiAvailable, origin: "ai" };
  }
  const kb = kbSuggestions(hits);
  return { suggestions: kb, query, aiAvailable, origin: kb.length ? "kb" : "none" };
}

/** Nhân viên đã dùng gợi ý → tăng lượt dùng cho nguồn. */
export const markUsed = (ids: string[]) => bumpUses(ids);
