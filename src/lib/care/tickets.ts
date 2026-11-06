import type { Ticket } from "@prisma/client";
import { db } from "../db";
import { nextNumber } from "../counter";
import { audit } from "../audit";
import { notify, userIdByName } from "../notify";
import { ticketPref, type CareCtx } from "./server";
import { slaDueAt, type Priority } from "./shared";
import { routeTicket } from "../perf/routing";

export type NewTicket = {
  subject: string;
  body?: string;
  recordId?: string | null;
  priority?: Priority;
  assignee?: string;
  channel?: string;
  fromConversationId?: string;
  fromCallId?: string;
  /** Phân loại phiếu: dùng để phân luồng về đội (Pref "ticketRouting"). */
  category?: string;
  teamId?: string | null;
};

const fmt = (d: Date) => d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: process.env.TZ || "Asia/Ho_Chi_Minh" });

/** Ghép nội dung phiếu từ hội thoại hộp thư: 10 tin gần nhất, gắn khách của hội thoại. */
async function fromConversation(workspaceId: string, id: string) {
  const conv = await db.conversation.findFirst({ where: { id, workspaceId } });
  if (!conv) return null;
  const msgs = await db.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 10 });
  const lines = msgs.reverse().map((m) => `[${fmt(m.createdAt)}] ${m.direction === "in" ? conv.name || "Khách" : m.direction === "note" ? `Ghi chú (${m.author})` : m.author || "Nhân viên"}: ${m.text}`);
  return { recordId: conv.recordId, subject: `Hỗ trợ ${conv.name || "khách"} qua ${conv.channel === "zalo" ? "Zalo" : "Messenger"}`, body: `Trích hội thoại:\n${lines.join("\n")}`, channel: "inbox" };
}

/** Ghép nội dung phiếu từ cuộc gọi: tóm tắt/ghi chú, gắn khách của cuộc gọi. */
async function fromCall(workspaceId: string, id: string) {
  const call = await db.call.findFirst({ where: { id, workspaceId } });
  if (!call) return null;
  const parts = [`Cuộc gọi ${call.direction === "in" ? "đến" : "đi"} lúc ${fmt(call.startedAt)} (${call.agentName}, ${Math.round(call.durationSec / 60)} phút, kết quả: ${call.outcome}).`];
  if (call.summary) parts.push(`Tóm tắt: ${call.summary}`);
  if (call.note) parts.push(`Ghi chú: ${call.note}`);
  return { recordId: call.recordId, subject: `Theo dõi sau cuộc gọi ${call.phone || ""}`.trim(), body: parts.join("\n"), channel: "call" };
}

/** Tạo phiếu: cấp số TK-năm-xxxx, đặt hạn theo SLA, ghi nhật ký, báo người được giao. */
export async function createTicket(ctx: CareCtx, input: NewTicket): Promise<Ticket | { error: string }> {
  const wid = ctx.workspace.id;
  let src: { recordId: string | null; subject: string; body: string; channel: string } | null = null;
  if (input.fromConversationId) {
    src = await fromConversation(wid, input.fromConversationId);
    if (!src) return { error: "Không tìm thấy hội thoại" };
  } else if (input.fromCallId) {
    src = await fromCall(wid, input.fromCallId);
    if (!src) return { error: "Không tìm thấy cuộc gọi" };
  }
  let recordId = input.recordId || src?.recordId || null;
  if (recordId && !(await db.record.findFirst({ where: { id: recordId, workspaceId: wid }, select: { id: true } }))) recordId = null;

  const priority = input.priority ?? "normal";
  const pref = await ticketPref(wid);
  const now = new Date();
  const subject = (input.subject?.trim() || src?.subject || "Yêu cầu hỗ trợ").slice(0, 200);
  const body = [input.body?.trim(), src?.body].filter(Boolean).join("\n\n").slice(0, 20000);
  const category = (input.category ?? "").trim().slice(0, 80);
  // Phân luồng: đội theo phân loại, chưa giao ai thì xoay vòng trong đội.
  const route = await routeTicket(wid, { category, teamId: input.teamId, assignee: input.assignee });
  const t = await db.ticket.create({
    data: {
      workspaceId: wid,
      number: await nextNumber(wid, "TK", now),
      recordId,
      subject,
      body,
      channel: input.channel || src?.channel || "manual",
      priority,
      assignee: route.assignee,
      teamId: route.teamId,
      category,
      dueAt: slaDueAt(priority, pref, now),
      createdBy: ctx.user.name,
    },
  });
  const who = { workspaceId: wid, user: ctx.user };
  await audit(who, "ticket.create", "ticket", t.id, `Tạo phiếu ${t.number} “${t.subject}”`);
  if (recordId) await db.activity.create({ data: { recordId, kind: "update", body: `Mở phiếu hỗ trợ ${t.number}: ${t.subject}`, author: ctx.user.name } });
  if (t.assignee) await notifyAssignee(wid, t, ctx.user.name);
  return t;
}

export async function notifyAssignee(workspaceId: string, t: Pick<Ticket, "id" | "number" | "subject" | "assignee">, by: string) {
  if (!t.assignee || t.assignee === by) return;
  const userId = await userIdByName(workspaceId, t.assignee);
  // Không tìm được tài khoản theo tên thì thôi, tránh báo nhầm cho cả workspace.
  if (!userId) return;
  await notify(workspaceId, { userId, kind: "ticket", text: `${by} giao cho bạn phiếu ${t.number} “${t.subject}”`, href: `/w/tickets/${t.id}` });
}

export type TicketDTO = {
  id: string;
  number: string;
  subject: string;
  body: string;
  channel: string;
  priority: Priority;
  status: string;
  assignee: string;
  teamId: string | null;
  category: string;
  recordId: string | null;
  customer: string;
  dueAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  csat: number | null;
  csatComment: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function ticketDTO(t: Ticket, titles: Map<string, string>): TicketDTO {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    body: t.body,
    channel: t.channel,
    priority: (["urgent", "high", "normal", "low"].includes(t.priority) ? t.priority : "normal") as Priority,
    status: t.status,
    assignee: t.assignee,
    teamId: t.teamId,
    category: t.category,
    recordId: t.recordId,
    customer: t.recordId ? titles.get(t.recordId) ?? "" : "",
    dueAt: t.dueAt?.toISOString() ?? null,
    escalatedAt: t.escalatedAt?.toISOString() ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    csat: t.csat,
    csatComment: t.csatComment,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Tên khách của các phiếu (một truy vấn). */
export async function titlesOf(ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const rows = uniq.length ? await db.record.findMany({ where: { id: { in: uniq } }, select: { id: true, title: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Gốc URL công khai: ưu tiên APP_URL, rồi header proxy, cuối cùng là URL của request. */
export function publicOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")}://${host}`;
  return new URL(req.url).origin;
}

/** Phiếu vừa xử lý xong: nếu đã chọn khảo sát sau phiếu (Pref "survey") thì gửi cho khách, mỗi phiếu một lần. */
export async function sendTicketSurvey(t: Pick<Ticket, "id" | "workspaceId" | "recordId">) {
  if (!t.recordId) return null;
  const { surveyPref, sendSurvey } = await import("../survey/service");
  const pref = await surveyPref(t.workspaceId);
  if (!pref.afterTicketSurveyId) return null;
  if (await db.surveyResponse.count({ where: { workspaceId: t.workspaceId, ticketId: t.id } })) return null;
  return sendSurvey(t.workspaceId, { surveyId: pref.afterTicketSurveyId, recordId: t.recordId, ticketId: t.id, channel: pref.afterTicketChannel }).catch((e) => {
    console.error("[ticket] survey", e instanceof Error ? e.message : e);
    return null;
  });
}
