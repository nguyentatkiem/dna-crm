// Học từ hội thoại: chọn hội thoại có kết quả tốt (đã xong, có thẻ, đã chốt đơn) → rút cặp hỏi–đáp để nhân viên duyệt.
import type { Prisma } from "@prisma/client";
import { db, parseJson } from "../db";
import { ai } from "../ai";
import { askJson } from "./llm";
import { buildExtractPrompt, ExtractOut } from "./prompt";
import { heuristicPairs, type LearnPair } from "./shared";
import { shopVoice } from "./store";
import { maskPII } from "./text";

export type LearnCandidate = { id: string; name: string; channel: string; status: string; tags: string[]; orderMarked: boolean; lastAt: string; messages: number; learned: boolean };

export async function learnCandidates(workspaceId: string, opts: { q?: string; all?: boolean } = {}): Promise<LearnCandidate[]> {
  const since = new Date(Date.now() - 180 * 864e5);
  const good: Prisma.ConversationWhereInput = opts.all ? {} : { OR: [{ status: "done" }, { orderMarked: true }, { NOT: { tagsJson: "[]" } }] };
  const rows = await db.conversation.findMany({
    where: { workspaceId, kind: "inbox", lastAt: { gte: since }, ...good, ...(opts.q?.trim() ? { name: { contains: opts.q.trim() } } : {}) },
    orderBy: { lastAt: "desc" },
    take: 60,
    select: { id: true, name: true, channel: true, status: true, tagsJson: true, orderMarked: true, lastAt: true, _count: { select: { messages: true } } },
  });
  const learned = new Set((await db.kbDoc.findMany({ where: { workspaceId, source: { in: rows.map((r) => `inbox:${r.id}`) } }, select: { source: true } })).map((d) => d.source.slice(6)));
  return rows
    .filter((r) => r._count.messages >= 2)
    .map((r) => ({ id: r.id, name: r.name || "Khách", channel: r.channel, status: r.status, tags: parseJson<string[]>(r.tagsJson, []), orderMarked: r.orderMarked, lastAt: r.lastAt.toISOString(), messages: r._count.messages, learned: learned.has(r.id) }));
}

/** Rút cặp hỏi–đáp (đã che SĐT/email/địa chỉ). Có AI: Claude tổng quát hoá; không: ghép câu hỏi khách → trả lời kế tiếp. */
export async function extractPairs(workspaceId: string, conversationIds: string[]): Promise<{ pairs: LearnPair[]; origin: "ai" | "rule" }> {
  const convs = await db.conversation.findMany({ where: { workspaceId, id: { in: conversationIds.slice(0, 20) } }, select: { id: true } });
  const useAi = !!ai();
  const voice = useAi ? await shopVoice(workspaceId) : null;
  const pairs: LearnPair[] = [];
  for (const c of convs) {
    const msgs = await db.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "asc" }, take: 120, select: { direction: true, text: true, author: true, createdAt: true } });
    const list = msgs.map((m) => ({ direction: m.direction, text: m.text, author: m.author, at: m.createdAt.getTime() }));
    if (voice) {
      const lines = list.filter((m) => m.direction === "in" || m.direction === "out").map((m) => ({ direction: m.direction as "in" | "out", text: m.text }));
      const { system, user } = buildExtractPrompt(voice, lines);
      const out = await askJson(ExtractOut, system, user, { maxTokens: 2500, tag: "learn" });
      if (out?.pairs.length) {
        for (const p of out.pairs.slice(0, 5)) if (p.question.trim() && p.answer.trim()) pairs.push({ question: maskPII(p.question).slice(0, 300), answer: maskPII(p.answer).slice(0, 1500), conversationId: c.id });
        continue;
      }
    }
    pairs.push(...heuristicPairs(c.id, list));
  }
  return { pairs, origin: useAi ? "ai" : "rule" };
}
