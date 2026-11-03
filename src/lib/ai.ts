import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Dna } from "./dna";
import { WorkspaceConfigSchema, type WorkspaceConfig } from "./config/schema";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
/** Trả null khi chưa cấu hình ANTHROPIC_API_KEY: mọi tính năng AI sẽ tự chuyển sang chế độ luật/template. */
export function ai(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

/** Tầng 2 của Config Engine: Claude tinh chỉnh template theo DNA. Trả null nếu không dùng được. */
export async function refineConfigWithAI(dna: Dna, base: WorkspaceConfig): Promise<WorkspaceConfig | null> {
  const c = ai();
  if (!c) return null;
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(WorkspaceConfigSchema) },
      system:
        "Bạn là chuyên gia triển khai CRM cho doanh nghiệp nhỏ Việt Nam. Bạn nhận DNA doanh nghiệp và một cấu hình mẫu theo ngành, rồi trả về cấu hình đã tinh chỉnh cho đúng doanh nghiệp đó. Viết mọi nhãn bằng tiếng Việt tự nhiên, ngắn gọn.",
      messages: [
        {
          role: "user",
          content: `DNA doanh nghiệp:
${JSON.stringify(dna, null, 2)}

Cấu hình mẫu của ngành:
${JSON.stringify(base, null, 2)}

Hãy tinh chỉnh cấu hình:
- Giữ nguyên các key đối tượng (contacts, deals, appointments) và không thêm đối tượng mới.
- Đổi giai đoạn của "deals" cho khớp quy trình bán trong salesSteps (4–7 giai đoạn, giai đoạn cuối là thắng; nếu có giai đoạn thất bại thì đặt ở cuối, màu red).
- Mỗi đối tượng tối đa 7 trường; chỉ thêm trường thật sự hữu ích cho ngành và sản phẩm này. Option của trường select lấy từ sản phẩm thực tế trong DNA.
- Key của status và trường viết không dấu, dạng snake_case.
- Đề xuất 3–6 automation thực tế; triggerValue của status_changed là key của status; actionValue của create_task có dạng "Nội dung việc với {title}|số ngày".
- Giữ team, agents, version như mẫu.`,
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return sanitize(res.parsed_output, base);
  } catch (e) {
    console.error("[DNA Architect] dùng template vì AI lỗi:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Bảo vệ hệ thống trước đầu ra AI: giữ key cố định, bỏ trùng lặp, đảm bảo có đủ đối tượng. */
function sanitize(out: WorkspaceConfig, base: WorkspaceConfig): WorkspaceConfig {
  const objects = base.objects.map((b) => {
    const o = out.objects.find((x) => x.key === b.key);
    if (!o || o.statuses.length < 2) return b;
    const uniq = <T extends { key: string }>(a: T[]) => a.filter((x, i) => x.key && a.findIndex((y) => y.key === x.key) === i);
    return { ...o, statuses: uniq(o.statuses).slice(0, 8), fields: uniq(o.fields).slice(0, 8) };
  });
  return {
    ...out,
    version: base.version,
    industry: base.industry,
    businessName: base.businessName,
    team: base.team,
    agents: base.agents,
    modules: { ...out.modules, appointments: base.modules.appointments },
    objects,
    automations: out.automations
      .filter((a) => objects.some((o) => o.key === a.triggerObject))
      .slice(0, 8),
  };
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
