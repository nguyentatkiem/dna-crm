// Gọi Claude có cấu trúc cho kho kiến thức. Trả null khi chưa có API key, AI từ chối hoặc lỗi — người gọi tự dùng luật.
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ai } from "../ai";
import { FAST_MODEL } from "./store";

export async function askJson<S extends z.ZodType>(schema: S, system: string, user: string, opts: { maxTokens?: number; model?: string; tag?: string } = {}): Promise<z.infer<S> | null> {
  const c = ai();
  if (!c) return null;
  try {
    const res = await c.messages.parse({
      model: opts.model ?? FAST_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return null;
    return (res.parsed_output as z.infer<S> | null) ?? null;
  } catch (e) {
    console.error(`[kb ${opts.tag ?? "ai"}]`, e instanceof Error ? e.message : e);
    return null;
  }
}
