import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { ai, MODEL } from "@/lib/ai";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { createRecord } from "@/lib/records";
import { computeKpis } from "@/lib/metrics";
import { vnd } from "@/lib/format";

export const maxDuration = 120;

const Body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30) });

type Ws = { id: string; cfg: WorkspaceConfig; user: string };

/** Bộ công cụ chung cho cả Claude và chế độ luật. */
const tools = {
  async search_records(ws: Ws, i: { object: string; query?: string; min_score?: number; status?: string }) {
    const rows = await db.record.findMany({ where: { workspaceId: ws.id, objectKey: i.object }, orderBy: { score: "desc" }, take: 200 });
    const q = i.query?.toLowerCase();
    const obj = getObject(ws.cfg, i.object);
    const list = rows
      .filter((r) => (!q || (r.title + r.dataJson).toLowerCase().includes(q)) && (i.min_score == null || r.score >= i.min_score) && (!i.status || r.status === i.status))
      .slice(0, 10)
      .map((r) => ({ id: r.id, title: r.title, status: obj?.statuses.find((s) => s.key === r.status)?.label ?? r.status, owner: r.ownerName, score: r.score, amount: r.amount }));
    return { count: list.length, items: list };
  },
  async create_record(ws: Ws, i: { object: string; title: string; phone?: string; status?: string }) {
    const obj = getObject(ws.cfg, i.object);
    if (!obj) return { error: "Không có bảng này" };
    const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
    const rec = await createRecord(ws.id, ws.cfg, { objectKey: i.object, title: i.title, status: i.status, data: phoneKey && i.phone ? { [phoneKey]: i.phone } : {} }, "Trợ lý CRM");
    return { id: rec.id, title: rec.title, score: rec.score, owner: rec.ownerName, link: `/w/b/${i.object}?open=${rec.id}` };
  },
  async create_task(ws: Ws, i: { title: string; due_in_days?: number; record_id?: string }) {
    const due = new Date(Date.now() + (i.due_in_days ?? 1) * 864e5);
    const t = await db.task.create({ data: { workspaceId: ws.id, title: i.title, dueAt: due, recordId: i.record_id, source: "Trợ lý CRM" } });
    return { id: t.id, title: t.title, due: due.toLocaleDateString("vi-VN") };
  },
  async get_kpis(ws: Ws) {
    const records = await db.record.findMany({ where: { workspaceId: ws.id } });
    return computeKpis(ws.cfg, records);
  },
};

function toolDefs(cfg: WorkspaceConfig): Anthropic.Beta.BetaTool[] {
  const objects = cfg.objects.map((o) => o.key);
  return [
    {
      name: "search_records",
      description: `Tìm bản ghi trong CRM. Bảng: ${cfg.objects.map((o) => `${o.key} = "${o.label}"`).join(", ")}. Khách nóng là score >= 70.`,
      input_schema: { type: "object", properties: { object: { type: "string", enum: objects }, query: { type: "string" }, min_score: { type: "number" }, status: { type: "string" } }, required: ["object"] },
    },
    {
      name: "create_record",
      description: "Tạo bản ghi mới (khách, giao dịch, lịch hẹn).",
      input_schema: { type: "object", properties: { object: { type: "string", enum: objects }, title: { type: "string", description: "Tên khách hoặc tên mục" }, phone: { type: "string" }, status: { type: "string", description: "Key trạng thái, để trống nếu không rõ" } }, required: ["object", "title"] },
    },
    {
      name: "create_task",
      description: "Tạo việc cần làm, có thể gắn với một bản ghi.",
      input_schema: { type: "object", properties: { title: { type: "string" }, due_in_days: { type: "number" }, record_id: { type: "string" } }, required: ["title"] },
    },
    { name: "get_kpis", description: "Lấy các chỉ số chính trên dashboard (doanh thu, tỉ lệ chốt...).", input_schema: { type: "object", properties: {} } },
  ];
}

async function runWithClaude(c: Anthropic, ws: Ws, history: z.infer<typeof Body>["messages"]) {
  const actions: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const system = `Bạn là Trợ lý CRM của ${ws.cfg.businessName}. Người dùng gọi khách là "${ws.cfg.terminology.contact}", giao dịch là "${ws.cfg.terminology.deal}". Trạng thái theo bảng: ${ws.cfg.objects.map((o) => `${o.key}: ${o.statuses.map((s) => `${s.key}="${s.label}"`).join(", ")}`).join("; ")}. Dùng công cụ để đọc và ghi dữ liệu thật, không bịa số liệu. Trả lời ngắn gọn bằng tiếng Việt. Hôm nay là ${new Date().toLocaleDateString("vi-VN")}.`;
  for (let turn = 0; turn < 6; turn++) {
    const res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      tools: toolDefs(ws.cfg),
      messages,
    });
    if (res.stop_reason === "refusal") return { reply: "Mình không xử lý được yêu cầu này. Bạn thử diễn đạt khác nhé.", actions };
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) {
      const reply = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "Đã xong.", actions };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      const fn = tools[u.name as keyof typeof tools] as ((w: Ws, i: never) => Promise<unknown>) | undefined;
      try {
        const out = fn ? await fn(ws, u.input as never) : { error: "Không có công cụ này" };
        if (u.name !== "search_records" && u.name !== "get_kpis") actions.push(u.name);
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: e instanceof Error ? e.message : "Lỗi", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Mình đã làm xong các bước có thể. Bạn kiểm tra lại giúp nhé.", actions };
}

/** Chế độ luật khi chưa có API key: hiểu vài mẫu câu phổ biến. */
async function runWithRules(ws: Ws, text: string) {
  const t = text.trim();
  const lower = t.toLowerCase();
  const term = ws.cfg.terminology;
  const add = t.match(/^thêm\s+(?:khách(?:\s+hàng|\s+mua)?|học viên|lead)?\s*([^,\d]+?)\s*(0\d{9,10})?(?:,|$)/i);
  if (add) {
    const r = await tools.create_record(ws, { object: "contacts", title: add[1].trim(), phone: add[2] });
    if ("error" in r) return { reply: r.error ?? "Không tạo được bản ghi", actions: [] };
    const actions = ["create_record"];
    let extra = "";
    const days = lower.match(/(\d+)\s*ngày/)?.[1] ?? (/(thứ|mai|tuần)/.test(lower) ? "1" : null);
    if (days) {
      await tools.create_task(ws, { title: `Gọi lại ${r.title}`, due_in_days: Number(days), record_id: r.id });
      actions.push("create_task");
      extra = ` Mình cũng tạo việc gọi lại sau ${days} ngày.`;
    }
    return { reply: `Đã thêm ${r.title} vào bảng ${term.contact}, điểm ban đầu ${r.score}/100${r.owner ? `, giao cho ${r.owner}` : ""}.${extra}`, actions };
  }
  if (/nóng|hot|tiềm năng/.test(lower)) {
    const r = await tools.search_records(ws, { object: "contacts", min_score: 70 });
    if (!r.count) return { reply: `Chưa có ${term.contact.toLowerCase()} nào từ 70 điểm trở lên.`, actions: [] };
    return { reply: `Có ${r.count} ${term.contact.toLowerCase()} nóng:\n${r.items.map((x) => `• ${x.title} (${x.score} điểm, ${x.owner || "chưa giao"})`).join("\n")}`, actions: [] };
  }
  if (/doanh thu|chỉ số|kpi|báo cáo|tỉ lệ/.test(lower)) {
    const k = await tools.get_kpis(ws);
    return { reply: k.map((x) => `• ${x.label}: ${x.value} (${x.hint})`).join("\n"), actions: [] };
  }
  const remind = t.match(/^(?:nhắc|tạo việc|việc)[:\s]+(.+)$/i);
  if (remind) {
    const days = Number(lower.match(/(\d+)\s*ngày/)?.[1] ?? 1);
    const r = await tools.create_task(ws, { title: remind[1].replace(/sau\s*\d+\s*ngày/i, "").trim(), due_in_days: days });
    return { reply: `Đã tạo việc “${r.title}”, hạn ${r.due}.`, actions: ["create_task"] };
  }
  const deals = getObject(ws.cfg, "deals");
  if (/giao dịch|đơn|cơ hội|liệu trình|đăng ký|deal/.test(lower) && deals) {
    const rows = await db.record.findMany({ where: { workspaceId: ws.id, objectKey: "deals" }, orderBy: { amount: "desc" }, take: 5 });
    return { reply: `5 ${term.deal.toLowerCase()} giá trị cao nhất:\n${rows.map((r) => `• ${r.title}: ${vnd(r.amount)} (${deals.statuses.find((s) => s.key === r.status)?.label})`).join("\n")}`, actions: [] };
  }
  return {
    reply: `Mình hiểu các câu như:\n• Thêm khách Mai Anh 0912345678, gọi lại sau 2 ngày\n• ${term.contact} nào đang nóng?\n• Doanh thu tháng này thế nào?\n• Nhắc: gửi báo giá cho anh Nam sau 3 ngày\nThêm ANTHROPIC_API_KEY để trợ lý hiểu mọi câu hỏi.`,
    actions: [],
  };
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Tin nhắn không hợp lệ");
  const ws: Ws = { id: a.ctx.workspace.id, cfg: a.ctx.config, user: a.ctx.user.name };
  const history = parsed.data.messages.slice(-12);
  const c = ai();
  let out: { reply: string; actions: string[] };
  try {
    out = c ? await runWithClaude(c, ws, history) : await runWithRules(ws, history[history.length - 1].content);
  } catch (e) {
    console.error("[Trợ lý CRM]", e instanceof Error ? e.message : e);
    out = await runWithRules(ws, history[history.length - 1].content);
  }
  if (out.actions.length) await db.agentLog.create({ data: { workspaceId: ws.id, agent: "Trợ lý CRM", message: `Thực hiện: ${out.actions.join(", ")}` } });
  return ok({ ...out, source: c ? "ai" : "rules" });
}
