// Điểm chất lượng chăm sóc hội thoại (0–100): luật + nhận xét của Claude (khi có ANTHROPIC_API_KEY), lưu vào Conversation.quality / qualityNote.
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "../db";
import { ai, MODEL } from "../ai";
import { getPref, setPref } from "../prefs";
import { loadAssignPref } from "./assign";
import { qualityNoteFromRules, scoreConversation, type QualityResult } from "./quality-rules";
import { maskPII } from "./sentiment-rules";

export { scoreConversation, qualityNoteFromRules, type QualityResult } from "./quality-rules";

const AI_PER_TICK = 20;

const AiReview = z.object({ score: z.number().int().min(0).max(100), note: z.string() });

/** Claude đọc hội thoại (đã che SĐT/email, tối đa 40 tin cuối) và nhận xét bằng tiếng Việt. */
export async function aiReview(transcript: { direction: string; text: string }[], rules: QualityResult): Promise<{ score: number; note: string } | null> {
  const c = ai();
  if (!c || !transcript.length) return null;
  const body = transcript
    .slice(-40)
    .map((m) => `${m.direction === "in" ? "Khách" : "Nhân viên"}: ${maskPII(m.text).slice(0, 400)}`)
    .join("\n");
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(AiReview) },
      system:
        "Bạn là trưởng nhóm chăm sóc khách hàng của một shop bán hàng qua fanpage ở Việt Nam. Chấm điểm 0–100 cách nhân viên trả lời (nhanh, đúng câu hỏi, lịch sự, có chốt đơn / hướng xử lý) và viết nhận xét 2–3 câu tiếng Việt, cụ thể, có một gợi ý cải thiện.",
      messages: [{ role: "user", content: `Điểm theo luật: ${rules.score} (${rules.items.map((i) => i.label).join("; ") || "không lỗi"}).\n\nHội thoại:\n${body}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output;
  } catch (e) {
    console.error("[quality] AI lỗi, dùng luật:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Điểm theo luật của một hội thoại (không ghi DB). */
export async function ruleScore(workspaceId: string, convId: string) {
  const conv = await db.conversation.findFirst({ where: { id: convId, workspaceId }, select: { id: true, name: true, status: true, sentiment: true } });
  if (!conv) return null;
  const [msgs, pref] = await Promise.all([
    db.message.findMany({ where: { conversationId: conv.id, direction: { in: ["in", "out"] } }, orderBy: { createdAt: "desc" }, take: 300, select: { direction: true, text: true, createdAt: true } }),
    loadAssignPref(workspaceId),
  ]);
  msgs.reverse();
  return { conv, msgs, rules: scoreConversation(conv, msgs, pref.workingHours) };
}

/** Chấm điểm và lưu một hội thoại. useAi → thêm nhận xét của Claude (nếu có khoá API). */
export async function scoreAndSave(workspaceId: string, convId: string, opts: { useAi?: boolean } = {}) {
  const base = await ruleScore(workspaceId, convId);
  if (!base) return null;
  const { conv, msgs, rules } = base;
  let score = rules.score;
  let note = qualityNoteFromRules(rules);
  if (opts.useAi) {
    const r = await aiReview(msgs, rules);
    if (r) {
      score = Math.round((rules.score + r.score) / 2);
      note = r.note.slice(0, 1000);
    }
  }
  await db.conversation.update({ where: { id: conv.id }, data: { quality: score, qualityNote: note } });
  return { score, note, rules };
}

/**
 * Job (15 phút): chấm điểm hội thoại đã im lặng hơn 2 giờ và có hoạt động mới kể từ lần chấm trước.
 * Mốc theo workspace ở Pref "inboxQualityCursor" (lastAt lớn nhất đã chấm) → tin mới đẩy lastAt lên sẽ được chấm lại.
 */
export async function tickQuality(now = Date.now()): Promise<number> {
  const idleBefore = new Date(now - 2 * 3600e3);
  const workspaces = await db.conversation.groupBy({ by: ["workspaceId"], where: { lastAt: { gte: new Date(now - 30 * 864e5), lte: idleBefore } } });
  let n = 0;
  for (const { workspaceId } of workspaces) {
    const cur = await getPref<{ at: number }>(workspaceId, "inboxQualityCursor", { at: now - 30 * 864e5 });
    const rows = await db.conversation.findMany({ where: { workspaceId, lastAt: { gt: new Date(cur.at), lte: idleBefore }, lastInAt: { not: null } }, orderBy: { lastAt: "asc" }, take: 100, select: { id: true, lastAt: true } });
    for (const r of rows) {
      // Giới hạn số lần gọi Claude mỗi lượt để kiểm soát chi phí; phần còn lại chấm bằng luật.
      await scoreAndSave(workspaceId, r.id, { useAi: n < AI_PER_TICK });
      n++;
    }
    const at = rows.length === 100 ? rows[rows.length - 1].lastAt.getTime() : idleBefore.getTime();
    await setPref(workspaceId, "inboxQualityCursor", { at });
  }
  return n;
}
