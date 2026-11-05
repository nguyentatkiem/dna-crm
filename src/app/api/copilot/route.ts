import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { ai, MODEL } from "@/lib/ai";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { createRecord } from "@/lib/records";
import { computeKpis } from "@/lib/metrics";
import { recordScope } from "@/lib/permissions";
import { outcomeOf } from "@/lib/calls-shared";
import { vnd } from "@/lib/format";

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
  page: z.string().max(200).optional(),
});

/** Ngữ cảnh cho công cụ: workspace, cấu hình, người dùng và điều kiện lọc theo quyền. */
type Ws = { id: string; cfg: WorkspaceConfig; user: string; scope: Prisma.RecordWhereInput; restricted: boolean };

const DAY = 864e5;
const startOfToday = () => new Date(new Date().toDateString());

/** Bộ công cụ chung cho cả Claude và chế độ luật. Mọi truy vấn Record đều đi qua ws.scope. */
const tools = {
  async search_records(ws: Ws, i: { object: string; query?: string; min_score?: number; status?: string }) {
    const rows = await db.record.findMany({ where: { AND: [ws.scope, { objectKey: i.object }] }, orderBy: { score: "desc" }, take: 300 });
    const q = i.query?.toLowerCase();
    const obj = getObject(ws.cfg, i.object);
    const list = rows
      .filter((r) => (!q || (r.title + r.dataJson).toLowerCase().includes(q)) && (i.min_score == null || r.score >= i.min_score) && (!i.status || r.status === i.status))
      .slice(0, 10)
      .map((r) => ({ id: r.id, title: r.title, status: obj?.statuses.find((s) => s.key === r.status)?.label ?? r.status, owner: r.ownerName, score: r.score, amount: r.amount, link: `/w/b/${r.objectKey}?open=${r.id}` }));
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
    const due = new Date(Date.now() + (i.due_in_days ?? 1) * DAY);
    const t = await db.task.create({ data: { workspaceId: ws.id, title: i.title, dueAt: due, recordId: i.record_id, source: "Trợ lý CRM" } });
    return { id: t.id, title: t.title, due: due.toLocaleDateString("vi-VN") };
  },
  async get_kpis(ws: Ws) {
    const records = await db.record.findMany({ where: ws.scope });
    return computeKpis(ws.cfg, records);
  },
  async get_tasks(ws: Ws, i: { when?: "overdue" | "today" | "open" }) {
    const today = startOfToday();
    const dueAt = i.when === "overdue" ? { lt: today } : i.when === "today" ? { lt: new Date(today.getTime() + DAY) } : undefined;
    const rows = await db.task.findMany({ where: { workspaceId: ws.id, done: false, ...(dueAt ? { dueAt } : {}), ...(ws.restricted ? { assignee: { in: [ws.user, ""] } } : {}) }, orderBy: { dueAt: "asc" }, take: 15 });
    return { count: rows.length, items: rows.map((t) => ({ title: t.title, due: t.dueAt?.toLocaleDateString("vi-VN") ?? "", overdue: !!t.dueAt && t.dueAt < today, assignee: t.assignee })) };
  },
  async get_calls(ws: Ws, i: { days?: number }) {
    const days = Math.min(90, Math.max(1, i.days ?? 7));
    const where: Prisma.CallWhereInput = { workspaceId: ws.id, startedAt: { gte: new Date(Date.now() - days * DAY) }, ...(ws.restricted ? { agentName: ws.user } : {}) };
    const rows = await db.call.findMany({ where, orderBy: { startedAt: "desc" }, take: 500, select: { outcome: true, aiScore: true, agentName: true, durationSec: true } });
    const byOutcome: Record<string, number> = {};
    for (const c of rows) byOutcome[outcomeOf(c.outcome).label] = (byOutcome[outcomeOf(c.outcome).label] ?? 0) + 1;
    const scored = rows.filter((c) => c.aiScore != null);
    const today = startOfToday();
    const callbacks = await db.call.findMany({ where: { workspaceId: ws.id, callbackAt: { gte: new Date(today.getTime() - 3 * DAY), lt: new Date(today.getTime() + DAY) }, ...(ws.restricted ? { agentName: ws.user } : {}) }, orderBy: { callbackAt: "asc" }, take: 10 });
    const recs = await db.record.findMany({ where: { AND: [ws.scope, { id: { in: callbacks.map((c) => c.recordId).filter((x): x is string => !!x) } }] }, select: { id: true, title: true, objectKey: true } });
    return {
      days,
      total: rows.length,
      talkMinutes: Math.round(rows.reduce((s, c) => s + c.durationSec, 0) / 60),
      avgAiScore: scored.length ? Math.round(scored.reduce((s, c) => s + (c.aiScore ?? 0), 0) / scored.length) : null,
      byOutcome,
      callbacksDue: callbacks.map((c) => {
        const r = recs.find((x) => x.id === c.recordId);
        return { name: r?.title ?? c.phone, at: c.callbackAt?.toLocaleString("vi-VN"), link: r ? `/w/b/${r.objectKey}?open=${r.id}` : "/w/telesales" };
      }),
    };
  },
  async get_inbox(ws: Ws) {
    const conv = db.conversation as typeof db.conversation | undefined;
    if (!conv) return { totalUnread: 0, items: [] };
    const rows = await conv.findMany({ where: { workspaceId: ws.id, unread: { gt: 0 }, ...(ws.restricted ? { assignee: { in: [ws.user, ""] } } : {}) }, orderBy: { lastAt: "desc" }, take: 10 });
    return { totalUnread: rows.reduce((s, c) => s + c.unread, 0), items: rows.map((c) => ({ name: c.name || "Khách", channel: c.channel, unread: c.unread, lastText: c.lastText.slice(0, 140), link: `/w/inbox?c=${c.id}` })) };
  },
  async get_ads(ws: Ws, i: { days?: number }) {
    const days = Math.min(90, Math.max(1, i.days ?? 30));
    try {
      const { buildAdReport } = await import("@/lib/marketing/report");
      const rep = await buildAdReport(ws.id, ws.cfg, days, ws.scope);
      const top = [...rep.rows].filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 6);
      return {
        days,
        hasSpend: rep.hasSpend,
        kpi: rep.kpi,
        campaigns: top.map((r) => ({ campaign: r.campaign, provider: r.provider, spend: r.spend, leads: r.leads, won: r.won, revenue: r.revenue, roas: r.spend ? Number((r.revenue / r.spend).toFixed(2)) : 0 })),
        insights: rep.insights,
        link: "/w/marketing",
      };
    } catch {
      return { days, hasSpend: false, error: "Chưa đọc được số liệu quảng cáo", link: "/w/marketing" };
    }
  },
};

const READ_ONLY = new Set(["search_records", "get_kpis", "get_tasks", "get_calls", "get_inbox", "get_ads"]);

function toolDefs(cfg: WorkspaceConfig): Anthropic.Beta.BetaTool[] {
  const objects = cfg.objects.map((o) => o.key);
  return [
    {
      name: "search_records",
      description: `Tìm bản ghi trong CRM. Bảng: ${cfg.objects.map((o) => `${o.key} = "${o.label}"`).join(", ")}. Khách nóng là score >= 70. Mỗi mục có link nội bộ.`,
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
    {
      name: "get_tasks",
      description: "Liệt kê việc chưa xong: quá hạn (overdue), đến hạn trong hôm nay (today) hoặc tất cả (open).",
      input_schema: { type: "object", properties: { when: { type: "string", enum: ["overdue", "today", "open"] } } },
    },
    {
      name: "get_calls",
      description: "Thống kê cuộc gọi telesales N ngày gần đây (số cuộc, kết quả, điểm AI trung bình) và danh sách hẹn gọi lại đến hạn.",
      input_schema: { type: "object", properties: { days: { type: "number", description: "Số ngày, mặc định 7" } } },
    },
    { name: "get_inbox", description: "Các hội thoại chưa đọc trong Hộp thư (Zalo, Messenger, website...).", input_schema: { type: "object", properties: {} } },
    {
      name: "get_ads",
      description: "Chi phí quảng cáo, lead, doanh thu và ROAS theo chiến dịch trong N ngày (mặc định 30).",
      input_schema: { type: "object", properties: { days: { type: "number" } } },
    },
  ];
}

async function runWithClaude(c: Anthropic, ws: Ws, history: z.infer<typeof Body>["messages"], page?: string) {
  const actions: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const system = `Bạn là Trợ lý CRM của ${ws.cfg.businessName}. Người dùng tên ${ws.user}, gọi khách là "${ws.cfg.terminology.contact}", giao dịch là "${ws.cfg.terminology.deal}". Trạng thái theo bảng: ${ws.cfg.objects.map((o) => `${o.key}: ${o.statuses.map((s) => `${s.key}="${s.label}"`).join(", ")}`).join("; ")}. ${page ? `Người dùng đang mở trang ${page}. ` : ""}Dùng công cụ để đọc và ghi dữ liệu thật, không bịa số liệu. Trả lời ngắn gọn bằng tiếng Việt; được dùng **in đậm**, danh sách gạch đầu dòng "- " và link nội bộ dạng [tên](/w/...) lấy từ trường link của công cụ. Hôm nay là ${new Date().toLocaleDateString("vi-VN")}.`;
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
        if (!READ_ONLY.has(u.name)) actions.push(u.name);
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
    return { reply: `Đã thêm [${r.title}](${r.link}) vào bảng ${term.contact}, điểm ban đầu **${r.score}/100**${r.owner ? `, giao cho ${r.owner}` : ""}.${extra}`, actions };
  }
  const remind = t.match(/^(?:nhắc|tạo việc|việc(?=:))[:\s]+(.+)$/i);
  if (remind) {
    const days = Number(lower.match(/(\d+)\s*ngày/)?.[1] ?? 1);
    const r = await tools.create_task(ws, { title: remind[1].replace(/sau\s*\d+\s*ngày/i, "").trim(), due_in_days: days });
    return { reply: `Đã tạo việc “${r.title}”, hạn **${r.due}**.`, actions: ["create_task"] };
  }
  if (/hộp thư|tin nhắn|chưa đọc|inbox|chat/.test(lower)) {
    const r = await tools.get_inbox(ws);
    if (!r.items.length) return { reply: "Hộp thư đã đọc hết, không có tin nào chờ trả lời.", actions: [] };
    return { reply: `Có **${r.totalUnread} tin chưa đọc** trong ${r.items.length} hội thoại:\n${r.items.slice(0, 6).map((x) => `- [${x.name}](${x.link}) (${x.unread}): ${x.lastText}`).join("\n")}`, actions: [] };
  }
  if (/quảng cáo|roas|chi phí|ads|marketing|chiến dịch|cpl/.test(lower)) {
    const r = await tools.get_ads(ws, { days: Number(lower.match(/(\d+)\s*ngày/)?.[1] ?? 30) });
    if (!r.hasSpend || !("kpi" in r) || !r.kpi) return { reply: `Chưa có chi phí quảng cáo ${r.days} ngày qua. Kết nối tài khoản quảng cáo hoặc nhập CSV ở [Marketing & ROAS](/w/marketing).`, actions: [] };
    const k = r.kpi;
    return {
      reply: `Quảng cáo ${r.days} ngày qua: chi **${vnd(k.spend)}**, ${k.leads} lead (CPL ${vnd(k.cpl)}), ${k.won} khách chốt, doanh thu **${vnd(k.revenue)}**, ROAS **${k.roas.toFixed(1)}x**.\n${r.campaigns.map((c) => `- ${c.campaign}: chi ${vnd(c.spend)}, ROAS ${c.roas}x`).join("\n")}${r.insights?.length ? `\n\n${r.insights[0]}` : ""}\n[Xem báo cáo đầy đủ](/w/marketing)`,
      actions: [],
    };
  }
  if (/cuộc gọi|gọi lại|telesales|gọi điện/.test(lower)) {
    const r = await tools.get_calls(ws, { days: Number(lower.match(/(\d+)\s*ngày/)?.[1] ?? 7) });
    const outs = Object.entries(r.byOutcome).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    const cb = r.callbacksDue.length ? `\n\n**Hẹn gọi lại đến hạn:**\n${r.callbacksDue.slice(0, 5).map((c) => `- [${c.name}](${c.link})`).join("\n")}` : "";
    if (!r.total && !cb) return { reply: `Chưa có cuộc gọi nào trong ${r.days} ngày qua. Bắt đầu gọi ở [Telesales](/w/telesales).`, actions: [] };
    return { reply: `${r.days} ngày qua có **${r.total} cuộc gọi**, ${r.talkMinutes} phút đàm thoại${r.avgAiScore != null ? `, điểm AI trung bình **${r.avgAiScore}**` : ""}.\n${outs}${cb}`, actions: [] };
  }
  if (/việc.*(quá hạn|hôm nay|trễ)|(quá hạn|trễ hạn)/.test(lower)) {
    const r = await tools.get_tasks(ws, { when: /quá hạn|trễ/.test(lower) ? "overdue" : "today" });
    if (!r.count) return { reply: "Không có việc nào quá hạn hay đến hạn. Tuyệt vời!", actions: [] };
    return { reply: `Có **${r.count} việc** cần làm:\n${r.items.slice(0, 8).map((x) => `- ${x.title}${x.due ? ` (hạn ${x.due}${x.overdue ? ", **quá hạn**" : ""})` : ""}`).join("\n")}\n[Mở Việc của tôi](/w/my-work)`, actions: [] };
  }
  if (/nóng|hot|tiềm năng/.test(lower)) {
    const r = await tools.search_records(ws, { object: "contacts", min_score: 70 });
    if (!r.count) return { reply: `Chưa có ${term.contact.toLowerCase()} nào từ 70 điểm trở lên.`, actions: [] };
    return { reply: `Có **${r.count} ${term.contact.toLowerCase()} nóng**:\n${r.items.map((x) => `- [${x.title}](${x.link}) — ${x.score} điểm, ${x.owner || "chưa giao"}`).join("\n")}`, actions: [] };
  }
  if (/doanh thu|chỉ số|kpi|báo cáo|tỉ lệ/.test(lower)) {
    const k = await tools.get_kpis(ws);
    return { reply: k.map((x) => `- ${x.label}: **${x.value}** (${x.hint})`).join("\n"), actions: [] };
  }
  const deals = getObject(ws.cfg, "deals");
  if (/giao dịch|đơn|cơ hội|liệu trình|đăng ký|deal/.test(lower) && deals) {
    const rows = await db.record.findMany({ where: { AND: [ws.scope, { objectKey: "deals" }] }, orderBy: { amount: "desc" }, take: 5 });
    if (!rows.length) return { reply: `Chưa có ${term.deal.toLowerCase()} nào.`, actions: [] };
    return { reply: `5 ${term.deal.toLowerCase()} giá trị cao nhất:\n${rows.map((r) => `- [${r.title}](/w/b/deals?open=${r.id}): **${vnd(r.amount)}** (${deals.statuses.find((s) => s.key === r.status)?.label})`).join("\n")}`, actions: [] };
  }
  return {
    reply: `Mình hiểu các câu như:\n- Thêm khách Mai Anh 0912345678, gọi lại sau 2 ngày\n- ${term.contact} nào đang nóng?\n- Doanh thu tháng này thế nào?\n- Có tin nhắn nào chưa đọc?\n- Cuộc gọi 7 ngày qua thế nào?\n- ROAS quảng cáo 30 ngày?\n- Nhắc: gửi báo giá cho anh Nam sau 3 ngày\n\nThêm **ANTHROPIC_API_KEY** để trợ lý hiểu mọi câu hỏi.`,
    actions: [],
  };
}

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Tin nhắn không hợp lệ");
  const scope = await recordScope(a.ctx);
  const ws: Ws = { id: a.ctx.workspace.id, cfg: a.ctx.config, user: a.ctx.user.name, scope, restricted: "OR" in scope };
  const history = parsed.data.messages.slice(-12);
  const c = ai();
  let out: { reply: string; actions: string[] };
  try {
    out = c ? await runWithClaude(c, ws, history, parsed.data.page) : await runWithRules(ws, history[history.length - 1].content);
  } catch (e) {
    console.error("[Trợ lý CRM]", e instanceof Error ? e.message : e);
    out = await runWithRules(ws, history[history.length - 1].content);
  }
  if (out.actions.length) await db.agentLog.create({ data: { workspaceId: ws.id, agent: "Trợ lý CRM", message: `Thực hiện: ${out.actions.join(", ")}` } });
  return ok({ ...out, source: c ? "ai" : "rules" });
}
