import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { AutomationDef, type WorkspaceConfig } from "@/lib/config/schema";
import { ai, MODEL } from "@/lib/ai";

const Body = z.union([z.object({ def: AutomationDef }), z.object({ text: z.string().trim().min(5).max(500) })]);

/** Automation Builder: biến câu mô tả thành công thức. Có AI thì dùng Claude, không thì dùng luật. */
async function parseText(text: string, cfg: WorkspaceConfig): Promise<{ def: AutomationDef; source: "ai" | "rules" } | null> {
  const c = ai();
  if (c) {
    try {
      const res = await c.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(AutomationDef) },
        messages: [
          {
            role: "user",
            content: `Các bảng và trạng thái trong CRM:
${cfg.objects.map((o) => `- ${o.key} ("${o.label}"): ${o.statuses.map((s) => `${s.key}="${s.label}"`).join(", ")}`).join("\n")}

Chuyển mô tả sau thành một công thức tự động hoá. triggerValue là key trạng thái (để trống nếu là record_created). Với create_task, actionValue có dạng "Nội dung việc với {title}|số ngày". Với notify, actionValue là nội dung thông báo.
Mô tả: "${text}"`,
          },
        ],
      });
      if (res.stop_reason !== "refusal" && res.parsed_output && cfg.objects.some((o) => o.key === res.parsed_output!.triggerObject)) {
        return { def: res.parsed_output, source: "ai" };
      }
    } catch (e) {
      console.error("[Automation Builder]", e instanceof Error ? e.message : e);
    }
  }
  const lower = text.toLowerCase();
  const [when, then = ""] = lower.split(/\s+thì\s+|,\s*/);
  let obj = cfg.objects.find((o) => when.includes(o.itemLabel.toLowerCase())) ?? cfg.objects.find((o) => o.key === "deals") ?? cfg.objects[0];
  let status = "";
  for (const o of cfg.objects) {
    const s = o.statuses.find((x) => when.includes(x.label.toLowerCase()));
    if (s) {
      obj = o;
      status = s.key;
      break;
    }
  }
  const raw = text.split(/\s+thì\s+/i)[1] ?? text;
  const actionType = /thông báo|báo /.test(then) ? "notify" : /chia|gán/.test(then) ? "assign_owner" : "create_task";
  const days = Number(then.match(/(\d+)\s*ngày/)?.[1] ?? 0);
  return {
    def: {
      triggerType: status ? "status_changed" : "record_created",
      triggerObject: obj.key,
      triggerValue: status,
      actionType,
      actionValue: actionType === "create_task" ? `${raw.replace(/sau\s*\d+\s*ngày/i, "").trim()} – {title}|${days}` : raw.trim(),
    },
    source: "rules",
  };
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Hãy mô tả rõ hơn, ví dụ: Khi giai đoạn đổi thành Đặt cọc thì báo kế toán");
  const result = "def" in parsed.data ? { def: parsed.data.def, source: "manual" as const } : await parseText(parsed.data.text, a.ctx.config);
  if (!result) return fail("Chưa hiểu mô tả này");
  const row = await db.automation.create({ data: { workspaceId: a.ctx.workspace.id, ...result.def } });
  await db.agentLog.create({ data: { workspaceId: a.ctx.workspace.id, agent: "Automation Builder", message: `Tạo công thức mới (${result.source === "ai" ? "AI" : result.source === "rules" ? "luật" : "thủ công"})` } });
  return ok({ automation: row, source: result.source }, 201);
}
