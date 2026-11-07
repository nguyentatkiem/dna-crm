// HỢP ĐỒNG: trang Kiểm tra kết nối gọi hàm này. Mô-đun kb tự hiện thực.
import type { Check } from "../health/types";
import { db } from "../db";
import { ai, MODEL } from "../ai";
import { BOT_AUTHOR, BOT_MODE_LABEL } from "./shared";
import { loadBotPref } from "./bot";
import { FAST_MODEL } from "./store";

const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
};

export async function health(workspaceId: string, opts: { live?: boolean } = {}): Promise<Check[]> {
  const out: Check[] = [];
  const G = "AI & kho kiến thức";
  const c = ai();
  if (!c) out.push({ key: "kb.ai", group: G, label: "Claude API", status: "off", detail: "Chưa có ANTHROPIC_API_KEY: gợi ý và chatbot dùng câu trả lời có sẵn trong kho (không viết lại theo ngữ cảnh).", testable: true });
  else if (!opts.live) out.push({ key: "kb.ai", group: G, label: "Claude API", status: "ok", detail: `Đã cấu hình khoá · model ${MODEL}, bot/gợi ý dùng ${FAST_MODEL}.`, testable: true });
  else {
    const t0 = Date.now();
    try {
      await c.messages.create({ model: FAST_MODEL, max_tokens: 16, messages: [{ role: "user", content: "ping" }] });
      out.push({ key: "kb.ai", group: G, label: "Claude API", status: "ok", detail: `Gọi thử ${FAST_MODEL} thành công (${Date.now() - t0} ms).`, testable: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/sk-[\w-]+/g, "sk-…").slice(0, 160) : "lỗi";
      out.push({ key: "kb.ai", group: G, label: "Claude API", status: "error", detail: `Gọi thử thất bại: ${msg}`, testable: true });
    }
  }

  const [faq, total] = await Promise.all([db.kbDoc.count({ where: { workspaceId, kind: "faq", active: true } }), db.kbDoc.count({ where: { workspaceId, active: true } })]);
  out.push({
    key: "kb.faq",
    group: G,
    label: "Kho kiến thức",
    status: faq >= 5 ? "ok" : faq > 0 ? "warn" : "warn",
    detail: faq >= 5 ? `${faq} câu hỏi thường gặp, ${total} mục đang dùng.` : `Mới có ${faq} câu hỏi thường gặp — nên có ít nhất 5 để gợi ý và chatbot trả lời được.`,
    fixHref: "/w/kb",
  });

  const pref = await loadBotPref(workspaceId);
  const last = await db.message.findFirst({ where: { author: BOT_AUTHOR, direction: "out", conversation: { workspaceId } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  out.push({
    key: "kb.bot",
    group: G,
    label: "Chatbot trả lời tự động",
    status: !pref.enabled ? "off" : faq < 5 ? "warn" : "ok",
    detail: !pref.enabled
      ? "Đang tắt."
      : `Bật · ${BOT_MODE_LABEL[pref.mode]} · kênh ${pref.channels.join(", ") || "tất cả"} · ngưỡng ${Math.round(pref.minConfidence * 100)}% · ${last ? `trả lời gần nhất ${ago(last.createdAt)}` : "chưa trả lời lần nào"}.`,
    fixHref: "/w/kb?tab=bot",
  });
  return out;
}
