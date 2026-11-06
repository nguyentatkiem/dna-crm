// Cảm xúc tin nhắn khách: luật tiếng Việt (luôn chạy) + Claude phân loại thêm khi có ANTHROPIC_API_KEY.
// Tin tiêu cực → đánh dấu hội thoại "negative" và báo người phụ trách + người có quyền "Xem mọi hội thoại".
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "../db";
import { ai, MODEL } from "../ai";
import { notify, userIdByName } from "../notify";
import { membersWith } from "../permissions";
import { getPref, setPref } from "../prefs";
import { maskPII, ruleSentiment, type SentimentLabel, type SentimentResult } from "./sentiment-rules";

export { ruleSentiment, maskPII, fold, type SentimentLabel, type SentimentResult } from "./sentiment-rules";

const AI_PER_TICK = 30;

const AiOut = z.object({ label: z.enum(["negative", "positive", "neutral"]), reason: z.string() });

/** Claude phân loại (đã che SĐT/email). Không có khoá API hoặc lỗi → null. */
export async function aiSentiment(text: string): Promise<{ label: SentimentLabel; reason: string } | null> {
  const c = ai();
  if (!c || !text.trim()) return null;
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(AiOut) },
      system:
        "Bạn phân loại cảm xúc tin nhắn khách hàng gửi fanpage bán hàng Việt Nam. negative = khách bực, chê, khiếu nại, đòi hoàn tiền, doạ bóc phốt/báo công an. positive = khách khen, cảm ơn, hài lòng. Còn lại neutral (hỏi giá, hỏi ship...). reason: một câu tiếng Việt ngắn.",
      messages: [{ role: "user", content: maskPII(text).slice(0, 3000) }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output;
  } catch (e) {
    console.error("[sentiment] AI lỗi, dùng luật:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Gộp luật + AI: luật chắc chắn tiêu cực (điểm ≤ -3) thì không cần hỏi AI. */
export async function classify(text: string, useAi = true): Promise<SentimentResult & { source: "rule" | "ai"; reason?: string }> {
  const r = ruleSentiment(text);
  // Luật đã chắc chắn, hoặc tin quá ngắn ("ok", "dạ") → không cần hỏi AI.
  if (r.score <= -3 || !useAi || text.trim().length < 12) return { ...r, source: "rule" };
  const a = await aiSentiment(text);
  if (!a) return { ...r, source: "rule" };
  return { ...r, label: a.label, source: "ai", reason: a.reason };
}

/** Báo hội thoại tiêu cực cho người phụ trách + người có quyền xem mọi hội thoại (mỗi người một lần / 24 giờ). */
async function alertNegative(workspaceId: string, conv: { id: string; name: string; assignee: string }, snippet: string) {
  const ids = new Set(await membersWith(workspaceId, "inbox_view_all"));
  const own = await userIdByName(workspaceId, conv.assignee);
  if (own) ids.add(own);
  const text = `Khách “${conv.name || "Khách"}” có vẻ không hài lòng: “${snippet.slice(0, 120)}”`;
  const href = `/w/inbox?c=${conv.id}`;
  // notifyOnce chống trùng theo cả workspace, ở đây cần chống trùng theo từng người nhận.
  const recent = await db.notification.findMany({ where: { workspaceId, href, kind: "inbox_negative", createdAt: { gte: new Date(Date.now() - 864e5) } }, select: { userId: true } });
  const sent = new Set(recent.map((r) => r.userId));
  for (const userId of ids) if (!sent.has(userId)) await notify(workspaceId, { userId, kind: "inbox_negative", text, href });
}

/**
 * HỢP ĐỒNG cho nhóm kênh: gọi sau khi lưu tin đến của khách.
 * Tiêu cực → Conversation.sentiment = "negative" + thông báo; tích cực → "positive" nếu chưa có nhãn.
 * Không ném lỗi.
 */
export async function analyzeIncoming(workspaceId: string, convId: string, text: string, opts: { useAi?: boolean } = {}): Promise<SentimentLabel> {
  try {
    if (!text?.trim()) return "neutral";
    const conv = await db.conversation.findFirst({ where: { id: convId, workspaceId }, select: { id: true, name: true, assignee: true, sentiment: true } });
    if (!conv) return "neutral";
    const r = await classify(text, opts.useAi ?? true);
    if (r.label === "negative") {
      if (conv.sentiment !== "negative") {
        await db.conversation.update({ where: { id: conv.id }, data: { sentiment: "negative" } });
        await alertNegative(workspaceId, conv, text);
      }
    } else if (r.label === "positive" && !conv.sentiment) {
      await db.conversation.update({ where: { id: conv.id }, data: { sentiment: "positive" } });
    }
    return r.label;
  } catch (e) {
    console.error("[analyzeIncoming]", e instanceof Error ? e.message : e);
    return "neutral";
  }
}

/**
 * Job (5 phút): quét tin đến mới của khách chưa được phân tích (theo mốc Pref "inboxSentimentCursor" mỗi workspace),
 * gộp theo hội thoại rồi phân tích. Không phụ thuộc việc nhóm kênh có gọi analyzeIncoming hay không.
 */
export async function tickSentiment(now = Date.now()): Promise<number> {
  const workspaces = await db.conversation.groupBy({ by: ["workspaceId"], where: { lastInAt: { gte: new Date(now - 864e5) } } });
  let done = 0;
  for (const { workspaceId } of workspaces) {
    const cur = await getPref<{ at: number }>(workspaceId, "inboxSentimentCursor", { at: now - 864e5 });
    const since = new Date(Math.max(cur.at, now - 7 * 864e5));
    const msgs = await db.message.findMany({
      where: { direction: "in", createdAt: { gt: since, lte: new Date(now) }, conversation: { workspaceId, sentiment: { not: "negative" } } },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: { conversationId: true, text: true, createdAt: true },
    });
    const byConv = new Map<string, string[]>();
    for (const m of msgs) if (m.text.trim()) byConv.set(m.conversationId, [...(byConv.get(m.conversationId) ?? []), m.text]);
    for (const [convId, texts] of byConv) {
      await analyzeIncoming(workspaceId, convId, texts.join("\n").slice(-3000), { useAi: done < AI_PER_TICK });
      done++;
    }
    const last = msgs.length === 500 ? msgs[msgs.length - 1].createdAt.getTime() : now;
    await setPref(workspaceId, "inboxSentimentCursor", { at: last });
  }
  return done;
}
