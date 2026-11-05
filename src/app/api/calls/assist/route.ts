import { appApi, fail, ok } from "@/lib/http";
import { ai, MODEL, textOf } from "@/lib/ai";
import { sttConfigured, transcribe } from "@/lib/calls";
import { detectObjections, objectionLibrary } from "@/lib/objections";

/**
 * Trợ lý khi đang gọi. Nhận:
 * - multipart: audio (đoạn ghi âm ~15 giây từ softphone), history (lời đã chép trước đó, tuỳ chọn)
 * - JSON {text, history?}: thử không cần audio, hoặc gợi ý từ câu nhân viên gõ nhanh.
 * Trả {text, objections, suggestion}. Không có máy chủ chép lời mà gửi audio → {needsStt: true}.
 */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const cfg = a.ctx.config;
  let text = "";
  let history = "";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    history = String(form.get("history") ?? "").slice(-3000);
    const f = form.get("audio");
    if (typeof form.get("text") === "string") text = String(form.get("text"));
    if (f instanceof File && f.size) {
      if (!sttConfigured()) return ok({ needsStt: true, text: "", objections: [], suggestion: "" });
      if (f.size > 8 * 1024 * 1024) return fail("Đoạn ghi âm quá dài");
      try {
        text = (await transcribe(Buffer.from(await f.arrayBuffer()), f.name || "chunk.webm")) ?? "";
      } catch (e) {
        return ok({ text: "", objections: [], suggestion: "", sttError: e instanceof Error ? e.message : String(e) });
      }
    }
  } else {
    const b = (await req.json().catch(() => ({}))) as { text?: unknown; history?: unknown };
    text = typeof b.text === "string" ? b.text : "";
    history = typeof b.history === "string" ? b.history.slice(-3000) : "";
    if (!text.trim()) return ok({ needsStt: !sttConfigured(), text: "", objections: [], suggestion: "" });
  }
  text = text.trim().slice(0, 4000);
  if (!text) return ok({ text: "", objections: [], suggestion: "" });

  const found = detectObjections(text, objectionLibrary(cfg)).slice(0, 3);
  let suggestion = found[0]?.replies[0] ?? "";
  let source: "ai" | "rules" = "rules";
  const c = ai();
  if (c && (found.length || text.length > 20)) {
    try {
      const res = await c.messages.create({
        model: MODEL,
        max_tokens: 300,
        output_config: { effort: "low" },
        system: `Bạn là trưởng nhóm telesales của ${cfg.businessName} (ngành ${cfg.industry}) đang nhắc bài cho nhân viên trong lúc gọi. Gợi ý đúng MỘT câu nhân viên nên nói tiếp, tối đa 2 câu, xưng "em", lễ phép, không bịa giá hay cam kết cụ thể. Chỉ trả câu nói, không giải thích.`,
        messages: [
          {
            role: "user",
            content: `${history ? `Đoạn trước:\n${history}\n\n` : ""}Vừa nghe được:\n${text}${found.length ? `\n\nKhách có vẻ đang từ chối: ${found.map((o) => o.label).join(", ")}` : ""}`,
          },
        ],
      });
      const out = textOf(res).trim();
      if (out && res.stop_reason !== "refusal") {
        suggestion = out.replace(/^["“]|["”]$/g, "");
        source = "ai";
      }
    } catch (e) {
      console.error("[Trợ lý cuộc gọi] dùng bản luật vì AI lỗi:", e instanceof Error ? e.message : e);
    }
  }
  return ok({ text, objections: found.map((o) => ({ key: o.key, label: o.label, replies: o.replies })), suggestion, source });
}
