// HỢP ĐỒNG (nhóm AI hiện thực): nhóm Kênh gọi sau khi lưu tin khách mới. Trả true nếu bot đã gửi tin cho khách
// (câu trả lời hoặc lời chuyển nhân viên). Không bao giờ ném lỗi ra ngoài.
import type { Conversation } from "@prisma/client";
import { db, parseJson } from "../db";
import { ai } from "../ai";
import { getPref, setPref } from "../prefs";
import { notify, userIdByName } from "../notify";
import { membersWith } from "../permissions";
import { loadAssignPref } from "../chat/assign";
import { isWorkingTime } from "../chat/hours";
import { answerConfidence, type Hit } from "./bm25";
import { askJson } from "./llm";
import { BotOut, buildBotPrompt, mapSources, type ChatLine, type Source } from "./prompt";
import { BOT_AUTHOR, BOT_DEFAULT, BOT_OFF_PREF, BOT_PREF, botGate, HANDOFF_NOTE, normBotPref, withDisclose, type BotPref, type GateInput, type GateResult } from "./shared";
import { bumpUses, retrieve, shopVoice } from "./store";
import { fold, keyTerms } from "./text";
import { recentLines } from "./suggest";

export async function loadBotPref(workspaceId: string): Promise<BotPref> {
  return normBotPref(await getPref<Record<string, unknown>>(workspaceId, BOT_PREF, {}));
}
export async function saveBotPref(workspaceId: string, p: Partial<BotPref>): Promise<BotPref> {
  const next = normBotPref({ ...(await loadBotPref(workspaceId)), ...p });
  await setPref(workspaceId, BOT_PREF, next);
  return next;
}

/** Bản đồ hội thoại đã tắt bot: { [conversationId]: true }. */
async function offMap(workspaceId: string): Promise<Record<string, boolean>> {
  const row = await db.pref.findUnique({ where: { workspaceId_key: { workspaceId, key: BOT_OFF_PREF } } });
  return parseJson<Record<string, boolean>>(row?.valueJson, {});
}
export async function setBotOff(workspaceId: string, conversationId: string, off: boolean) {
  const m = await offMap(workspaceId);
  if (off) m[conversationId] = true;
  else delete m[conversationId];
  // Giữ gọn: tối đa 5000 mục gần nhất.
  const keys = Object.keys(m);
  const trimmed = keys.length > 5000 ? Object.fromEntries(keys.slice(-5000).map((k) => [k, true])) : m;
  await setPref(workspaceId, BOT_OFF_PREF, trimmed);
}

/* ───────────── Trả lời ───────────── */

export type BotAnswer = { answer: string; sources: Source[]; confidence: number; origin: "ai" | "kb" | "greeting" | "none"; hits: Pick<Hit, "docId" | "title" | "kind" | "confidence">[] };

const GREET = /^(xin chao|chao|hello|hi|alo|hey|shop oi|ad oi|chao shop|chao ban)\b/;

/**
 * Câu trả lời của bot cho một câu hỏi: truy xuất kho → (có AI) Claude viết câu trả lời bám nguồn + tự đánh giá;
 * (không AI) câu trả lời của FAQ/sản phẩm khớp nhất. confidence 0–1 so với ngưỡng minConfidence.
 */
export async function botAnswer(workspaceId: string, question: string, lines: ChatLine[], pref: BotPref): Promise<BotAnswer> {
  const hits = await retrieve(workspaceId, question, 5);
  const brief = hits.map((h) => ({ docId: h.docId, title: h.title, kind: h.kind, confidence: Math.round(h.confidence * 100) / 100 }));
  const justHello = !keyTerms(question).length || (GREET.test(fold(question).trim()) && (hits[0]?.confidence ?? 0) < 0.5);
  if (pref.greeting.trim() && justHello) {
    return { answer: pref.greeting.trim(), sources: [], confidence: 1, origin: "greeting", hits: brief };
  }
  const top = hits[0];
  if (!top || top.confidence < 0.3) return { answer: "", sources: [], confidence: top?.confidence ?? 0, origin: "none", hits: brief };
  if (ai()) {
    const { system, user } = buildBotPrompt(await shopVoice(workspaceId), lines.length ? lines : [{ direction: "in", text: question }], hits);
    const out = await askJson(BotOut, system, user, { maxTokens: 1200, tag: "bot" });
    if (out) {
      const sources = mapSources(out.sources ?? [], hits);
      const used = Math.max(0, ...sources.map((s) => hits.find((h) => h.docId === s.id)?.confidence ?? 0));
      const answer = (out.answer ?? "").replace(/\[S\d+\]/g, "").trim().slice(0, 1000);
      if (!answer || !out.confident || !sources.length) return { answer, sources, confidence: Math.min(used, 0.4), origin: "ai", hits: brief };
      return { answer, sources, confidence: Math.min(1, used + 0.1), origin: "ai", hits: brief };
    }
  }
  // Không AI (hoặc AI lỗi): chỉ dùng mục là câu trả lời sẵn (FAQ, sản phẩm, học từ hội thoại).
  const answerable = hits.filter((x) => x.kind === "faq" || x.kind === "product" || x.kind === "conversation");
  const h = answerable[0];
  if (!h) return { answer: "", sources: [], confidence: Math.min(top.confidence, 0.5), origin: "none", hits: brief };
  return { answer: h.text.trim(), sources: [{ id: h.docId, title: h.title }], confidence: answerConfidence(answerable), origin: "kb", hits: brief };
}

/* ───────────── Trạng thái hội thoại ───────────── */

type Facts = Omit<GateInput, "pref" | "text"> & { botReplies: number; lastBotAt: Date | null };

async function facts(workspaceId: string, conv: Conversation, now: number): Promise<Facts> {
  const [msgs, off, assign] = await Promise.all([
    db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 200, select: { direction: true, author: true, text: true, status: true, createdAt: true } }),
    offMap(workspaceId),
    loadAssignPref(workspaceId),
  ]);
  const staffOut = msgs.find((m) => m.direction === "out" && m.author !== BOT_AUTHOR);
  const lastStaffAt = staffOut?.createdAt.getTime() ?? 0;
  const botOut = msgs.filter((m) => m.direction === "out" && m.author === BOT_AUTHOR && m.status !== "failed");
  const handoff = msgs.find((m) => m.direction === "note" && m.author === BOT_AUTHOR && m.text.startsWith(HANDOFF_NOTE));
  const hAt = handoff?.createdAt.getTime() ?? 0;
  return {
    channel: conv.channel,
    kind: conv.kind,
    assignee: conv.assignee,
    sentiment: conv.sentiment,
    inWorkingHours: isWorkingTime(now, assign.workingHours),
    offForConversation: !!off[conv.id],
    inboundCount: msgs.filter((m) => m.direction === "in").length,
    botRepliesSinceStaff: botOut.filter((m) => m.createdAt.getTime() > lastStaffAt).length,
    minutesSinceStaffReply: staffOut ? (now - lastStaffAt) / 60000 : null,
    handoffPending: hAt > lastStaffAt && now - hAt < 864e5,
    botReplies: botOut.length,
    lastBotAt: botOut[0]?.createdAt ?? null,
  };
}

export type BotStatus = { enabled: boolean; off: boolean; replies: number; lastAt: string | null; handoffPending: boolean };

export async function botStatus(workspaceId: string, conv: Conversation): Promise<BotStatus> {
  const [pref, f] = await Promise.all([loadBotPref(workspaceId), facts(workspaceId, conv, Date.now())]);
  return { enabled: pref.enabled, off: f.offForConversation, replies: f.botReplies, lastAt: f.lastBotAt?.toISOString() ?? null, handoffPending: f.handoffPending };
}

/* ───────────── Gửi ───────────── */

/**
 * Gửi tin qua sendReply của Hộp thư với ngữ cảnh hệ thống (tác giả "Trợ lý tự động"), rồi trả lại các trường
 * sendReply tự đổi cho nhân viên thật: không nhận hội thoại, không tính là phản hồi đầu, giữ số tin chưa đọc.
 */
async function sendAsBot(conv: Conversation, text: string): Promise<{ ok: boolean; error: string }> {
  const ws = await db.workspace.findUnique({ where: { id: conv.workspaceId }, select: { id: true, settingsJson: true } });
  if (!ws) return { ok: false, error: "Không tìm thấy workspace" };
  const { sendReply } = await import("../inbox");
  const r = await sendReply({ user: { id: "", name: BOT_AUTHOR }, workspace: ws }, conv, text);
  await db.conversation.updateMany({ where: { id: conv.id, assignee: BOT_AUTHOR }, data: { assignee: conv.assignee } });
  if (!r.error) await db.conversation.update({ where: { id: conv.id }, data: { unread: Math.max(conv.unread, 1), firstReplyAt: conv.firstReplyAt } }).catch(() => {});
  return { ok: !r.error, error: r.error };
}

async function note(conv: Conversation, text: string) {
  await db.message.create({ data: { conversationId: conv.id, direction: "note", text: text.slice(0, 2000), author: BOT_AUTHOR } });
}

async function notifyStaff(workspaceId: string, conv: Conversation, why: string) {
  const text = `${BOT_AUTHOR} chuyển “${conv.name || "Khách"}” cho nhân viên · ${why}`;
  const href = `/w/inbox?c=${conv.id}`;
  const uid = conv.assignee ? await userIdByName(workspaceId, conv.assignee) : "";
  const ids = uid ? [uid] : await membersWith(workspaceId, "inbox_view_all");
  for (const userId of ids.slice(0, 20)) await notify(workspaceId, { userId, kind: "inbox", text, href });
}

async function handoff(workspaceId: string, conv: Conversation, pref: BotPref, why: string): Promise<boolean> {
  let sent = false;
  if (pref.handoffMessage.trim()) sent = (await sendAsBot(conv, withDisclose(pref.handoffMessage, pref))).ok;
  await note(conv, `${HANDOFF_NOTE}: ${why}.`);
  await notifyStaff(workspaceId, conv, why);
  return sent;
}

export async function maybeAutoReply(workspaceId: string, conv: Conversation, text: string): Promise<boolean> {
  try {
    const pref = await loadBotPref(workspaceId);
    if (!pref.enabled) return false;
    const fresh = (await db.conversation.findFirst({ where: { id: conv.id, workspaceId } })) ?? conv;
    const now = Date.now();
    const f = await facts(workspaceId, fresh, now);
    const gate = botGate({ ...f, pref, text });
    if (!gate.go) {
      if (gate.handoff && !f.handoffPending) return await handoff(workspaceId, fresh, pref, gate.reason);
      return false;
    }
    const lines = await recentLines(fresh.id, 8);
    const ans = await botAnswer(workspaceId, text, lines, pref);
    if (!ans.answer || ans.confidence < pref.minConfidence) {
      return await handoff(workspaceId, fresh, pref, ans.answer ? `chưa chắc câu trả lời (độ tin cậy ${Math.round(ans.confidence * 100)}%)` : "kho kiến thức chưa có câu trả lời");
    }
    const r = await sendAsBot(fresh, withDisclose(ans.answer, pref));
    if (!r.ok) {
      await note(fresh, `Bot không gửi được: ${r.error}`);
      return false;
    }
    await bumpUses(ans.sources.map((s) => s.id));
    await note(fresh, `Bot đã trả lời (độ tin cậy ${Math.round(ans.confidence * 100)}%, ${ans.origin === "ai" ? "Claude viết" : ans.origin === "greeting" ? "lời chào" : "theo kho"}). Nguồn: ${ans.sources.map((s) => s.title).join("; ") || "—"}`);
    return true;
  } catch (e) {
    console.error("[kb bot]", e instanceof Error ? e.message : e);
    return false;
  }
}

/* ───────────── Sân thử (không gửi) ───────────── */

export type TestResult = { gate: GateResult; answer: BotAnswer; wouldSend: "answer" | "handoff" | "nothing"; text: string; minConfidence: number };

/** Thử hỏi bot: giả lập khách nhắn trên kênh, trong/ngoài giờ. Bỏ qua công tắc bật/tắt để thử trước khi bật. */
export async function testBot(workspaceId: string, question: string, opts: { channel?: string; inWorkingHours?: boolean; pref?: Partial<BotPref> } = {}): Promise<TestResult> {
  const pref = normBotPref({ ...(await loadBotPref(workspaceId)), ...(opts.pref ?? {}), enabled: true });
  const gate = botGate({
    pref,
    text: question,
    channel: opts.channel ?? pref.channels[0] ?? "messenger",
    kind: "inbox",
    assignee: "",
    sentiment: "",
    inWorkingHours: !!opts.inWorkingHours,
    offForConversation: false,
    inboundCount: 1,
    botRepliesSinceStaff: 0,
    minutesSinceStaffReply: null,
    handoffPending: false,
  });
  const answer = await botAnswer(workspaceId, question, [{ direction: "in", text: question }], pref);
  if (!gate.go) return { gate, answer, wouldSend: gate.handoff ? "handoff" : "nothing", text: gate.handoff ? withDisclose(pref.handoffMessage, pref) : "", minConfidence: pref.minConfidence };
  const okk = !!answer.answer && answer.confidence >= pref.minConfidence;
  return { gate, answer, wouldSend: okk ? "answer" : "handoff", text: withDisclose(okk ? answer.answer : pref.handoffMessage, pref), minConfidence: pref.minConfidence };
}

export { BOT_DEFAULT };
