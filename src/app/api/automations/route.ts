import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { AutomationDef, type WorkspaceConfig } from "@/lib/config/schema";
import { ai, MODEL } from "@/lib/ai";
import { OUTCOMES } from "@/lib/calls-shared";
import { Rule, TRIGGER_LABEL, ACTION_LABEL, legacyActions, ruleHistory, ruleName, ruleOf, rowOf, sentenceText } from "@/lib/automation";
import { managerApi, validateRule } from "./shared";

/** Danh sách luật kèm lần chạy gần nhất. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rows = await db.automation.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const out = await Promise.all(
    rows.map(async (r) => {
      const rule = ruleOf(r);
      const last = await ruleHistory(a.ctx.workspace.id, ruleName(rule, a.ctx.config), 1);
      return { id: r.id, enabled: r.enabled, runs: r.runs, createdAt: r.createdAt.toISOString(), rule, text: sentenceText(rule, a.ctx.config), lastRunAt: last[0]?.createdAt.toISOString() ?? null };
    }),
  );
  return ok(out);
}

const Body = z.union([
  z.object({ rule: Rule }),
  z.object({ duplicateOf: z.string().min(1) }),
  z.object({ def: AutomationDef }),
  z.object({ text: z.string().trim().min(5).max(500) }),
]);

/** Automation Builder: biến câu mô tả thành luật. Có AI thì dùng Claude, không thì dùng luật dự phòng. */
async function parseText(text: string, cfg: WorkspaceConfig, sequences: { id: string; name: string }[]): Promise<{ rule: Rule; source: "ai" | "rules" }> {
  const c = ai();
  if (c) {
    try {
      const res = await c.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(Rule) },
        messages: [
          {
            role: "user",
            content: `Bạn dựng luật tự động hoá cho CRM. Các bảng:
${cfg.objects.map((o) => `- ${o.key} ("${o.label}"): trạng thái ${o.statuses.map((s) => `${s.key}="${s.label}"`).join(", ")}; trường ${o.fields.map((f) => `${f.key}="${f.label}"(${f.type})`).join(", ")}`).join("\n")}
Đội ngũ: ${cfg.team.join(", ")}. Kịch bản chăm sóc: ${sequences.map((s) => `${s.id}="${s.name}"`).join(", ") || "chưa có"}.
Kết quả cuộc gọi: ${OUTCOMES.map((o) => `${o.key}="${o.label}"`).join(", ")}.

Trigger (trigger.type): ${Object.entries(TRIGGER_LABEL).map(([k, v]) => `${k}=${v}`).join("; ")}. trigger.object là key bảng. status_changed dùng to/from là key trạng thái; field_changed dùng field + value; score_above dùng threshold; call_logged dùng value = key kết quả; message_received dùng value = zalo|messenger; date_arrived dùng field (trường ngày) + days.
Điều kiện (AND): field là status|owner|channel|source|amount|score|title hoặc "f:<key trường>"; op là eq|neq|gt|lt|contains|empty|not_empty.
Hành động: ${Object.entries(ACTION_LABEL).map(([k, v]) => `${k}=${v}`).join("; ")}. create_task: text + days + mode ("owner" hoặc "user" kèm user). notify: text + mode owner|all|user. assign_owner: mode round_robin|user|least_busy. set_status: value = key trạng thái. set_field: field + value. send_message: channel zalo|zns|sms|email + text. enroll_sequence: sequenceId. webhook: url. add_activity: text. create_record: object (thường là deals) + text (tên, có thể "{title}").
Nội dung có thể dùng biến {title}, {owner}, {status}, {amount}, {phone}. name là tên luật ngắn gọn tiếng Việt.

Mô tả: "${text}"`,
          },
        ],
      });
      const rule = res.parsed_output;
      if (res.stop_reason !== "refusal" && rule && !validateRule(rule, cfg)) return { rule, source: "ai" };
    } catch (e) {
      console.error("[Automation Builder]", e instanceof Error ? e.message : e);
    }
  }
  return { rule: fallbackRule(text, cfg), source: "rules" };
}

/** Luật dự phòng khi không có AI: nhận diện trigger, trạng thái và các hành động bằng từ khoá. */
function fallbackRule(text: string, cfg: WorkspaceConfig): Rule {
  const [whenRaw, thenRaw = ""] = text.split(/\s+thì\s+/i);
  const when = whenRaw.toLowerCase();
  const then = thenRaw || text;
  let obj = cfg.objects.find((o) => when.includes(o.itemLabel.toLowerCase())) ?? cfg.objects.find((o) => o.key === "deals") ?? cfg.objects[0];
  let status = "";
  // "có khách mới" là tạo mục, không phải đổi sang trạng thái "Khách mới".
  const created = /(^|\s)có\s.*mới/.test(when) && !/đổi|chuyển|sang/.test(when);
  for (const o of created ? [] : cfg.objects) {
    const s = o.statuses.find((x) => when.includes(x.label.toLowerCase()));
    if (s) {
      obj = o;
      status = s.key;
      break;
    }
  }
  const contacts = cfg.objects.find((o) => o.key === "contacts") ?? obj;
  let trigger: Rule["trigger"] = status ? { type: "status_changed", object: obj.key, to: status } : { type: "record_created", object: obj.key };
  const outcome = OUTCOMES.find((o) => when.includes(o.label.toLowerCase()) || (o.key === "no_answer" && /không nghe/.test(when)));
  if (/cuộc gọi|gọi xong|sau khi gọi/.test(when)) trigger = { type: "call_logged", object: contacts.key, value: outcome?.key };
  else if (/nhắn|tin nhắn|inbox|hộp thư/.test(when)) trigger = { type: "message_received", object: contacts.key };
  else if (/điểm.*(trên|vượt|>)\s*(\d+)/.test(when)) trigger = { type: "score_above", object: contacts.key, threshold: Number(when.match(/(\d+)/)?.[1] ?? 70) };

  const conditions: Rule["conditions"] = [];
  const amount = when.match(/(?:giá trị|trên|lớn hơn)\s*([\d.,]+)\s*(tr|triệu|tỷ|k)?/);
  if (amount && trigger.type !== "score_above") {
    const n = Number(amount[1].replace(/[.,]/g, "")) * (amount[2]?.startsWith("t") ? (amount[2] === "tỷ" ? 1e9 : 1e6) : amount[2] === "k" ? 1e3 : 1);
    if (n) conditions.push({ field: "amount", op: "gt", value: String(n) });
  }
  if (/quảng cáo|ads/.test(when)) conditions.push({ field: "channel", op: "eq", value: "ads" });

  // Tách nhiều hành động nối bằng "và", "rồi", dấu phẩy.
  const actions: Rule["actions"] = [];
  for (const part of then.split(/\s*(?:,|;|\svà\s|\srồi\s)\s*/i).filter((x) => x.trim().length > 2)) {
    const p = part.toLowerCase();
    const days = Number(p.match(/(\d+)\s*ngày/)?.[1] ?? 0);
    const clean = part
      .replace(/sau\s*\d+\s*ngày/i, "")
      .replace(/^(tạo việc|tạo task|nhắc|thông báo( cho)?( cả đội| mọi người| tất cả| người phụ trách)?|báo|ghi chú|gửi( tin)?( zalo| zns| sms| email)?)\s*/i, "")
      .trim();
    if (/zalo|zns|sms|email|nhắn tin|gửi tin/.test(p)) actions.push({ type: "send_message", channel: /zns/.test(p) ? "zns" : /sms/.test(p) ? "sms" : /email/.test(p) ? "email" : "zalo", text: clean ? `Chào {title}, ${clean}` : "Chào {title}, cảm ơn anh/chị đã quan tâm." });
    else if (/thông báo|báo /.test(p)) actions.push({ type: "notify", mode: /cả đội|mọi người|tất cả/.test(p) ? "all" : "owner", text: clean ? `${clean} – {title}` : "Cập nhật mới ở {title}" });
    else if (/chia|gán|giao cho|phân công/.test(p)) actions.push({ type: "assign_owner", mode: /ít việc/.test(p) ? "least_busy" : "round_robin" });
    else if (/ghi chú/.test(p)) actions.push({ type: "add_activity", text: clean || "Ghi chú tự động" });
    else actions.push({ type: "create_task", text: `${clean ? clean[0].toUpperCase() + clean.slice(1) : "Theo dõi"} – {title}`, days, mode: "owner" });
  }
  if (!actions.length) actions.push(...legacyActions("create_task", `${then.trim()} – {title}|0`));
  const rule: Rule = { name: "", trigger, conditions, actions: actions.slice(0, 10) };
  rule.name = text.trim().slice(0, 80);
  return rule;
}

export async function POST(req: Request) {
  const a = await managerApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Hãy mô tả rõ hơn, ví dụ: Khi giai đoạn đổi thành Đặt cọc thì báo kế toán");
  const p = parsed.data;
  let rule: Rule;
  let source: "ai" | "rules" | "manual" | "duplicate" = "manual";
  let enabled = true;
  if ("rule" in p) rule = p.rule;
  else if ("duplicateOf" in p) {
    const src = await db.automation.findFirst({ where: { id: p.duplicateOf, workspaceId: wid } });
    if (!src) return fail("Không tìm thấy luật", 404);
    const r = ruleOf(src);
    rule = { name: `${ruleName(r, a.ctx.config)} (bản sao)`.slice(0, 120), trigger: r.trigger, conditions: r.conditions, actions: r.actions };
    source = "duplicate";
    enabled = false;
  } else if ("def" in p) {
    const r = ruleOf({ name: "", ...p.def, conditionsJson: "[]", actionsJson: "[]" });
    rule = { name: "", trigger: r.trigger, conditions: [], actions: r.actions };
    rule.name = sentenceText(rule, a.ctx.config).slice(0, 80);
  } else {
    const sequences = await db.sequence.findMany({ where: { workspaceId: wid }, select: { id: true, name: true } });
    ({ rule, source } = await parseText(p.text, a.ctx.config, sequences));
  }
  const err = validateRule(rule, a.ctx.config);
  if (err) return fail(err);
  const row = await db.automation.create({ data: { workspaceId: wid, enabled, ...rowOf(rule) } });
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "automation", row.id, `Tạo luật “${row.name}”${source === "ai" ? " bằng AI" : source === "rules" ? " từ mô tả" : source === "duplicate" ? " (nhân bản)" : ""}`, rule);
  await db.agentLog.create({ data: { workspaceId: wid, agent: "Automation Builder", message: `Tạo luật “${row.name}” (${source === "ai" ? "AI" : source === "rules" ? "luật" : source === "duplicate" ? "nhân bản" : "thủ công"})` } });
  const out = ruleOf(row);
  return ok({ automation: { id: row.id, enabled: row.enabled, runs: row.runs, createdAt: row.createdAt.toISOString(), rule: out, text: sentenceText(out, a.ctx.config), lastRunAt: null }, source }, 201);
}
