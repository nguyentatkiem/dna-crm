import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit, diffOf } from "@/lib/audit";
import { can, getRole } from "@/lib/permissions";
import { contactCard, findTicket, ticketPref } from "@/lib/care/server";
import { notifyAssignee, publicOrigin, sendTicketSurvey, ticketDTO, titlesOf } from "@/lib/care/tickets";
import { routeTicket } from "@/lib/perf/routing";
import { PRIORITIES, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL, slaDueAt } from "@/lib/care/shared";

type P = { params: Promise<{ id: string }> };

/** Chi tiết phiếu: luồng trao đổi, thông tin khách, nhật ký thao tác, link khảo sát. */
export async function GET(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await findTicket(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy phiếu", 404);
  const [messages, logs, rec, inv] = await Promise.all([
    db.ticketMessage.findMany({ where: { ticketId: t.id }, orderBy: { createdAt: "asc" } }),
    db.auditLog.findMany({ where: { workspaceId: a.ctx.workspace.id, entity: "ticket", entityId: t.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    t.recordId ? db.record.findFirst({ where: { id: t.recordId, workspaceId: a.ctx.workspace.id } }) : null,
    // Lời mời khảo sát tự gửi khi phiếu "Đã xử lý" (Cài đặt khảo sát), để nhân viên thấy link / kết quả.
    db.surveyResponse.findFirst({ where: { workspaceId: a.ctx.workspace.id, ticketId: t.id }, orderBy: { sentAt: "desc" }, include: { survey: { select: { id: true, name: true } } } }),
  ]);
  return ok({
    ticket: ticketDTO(t, new Map(rec ? [[rec.id, rec.title]] : [])),
    customer: rec ? contactCard(a.ctx.config, rec) : null,
    messages: messages.map((m) => ({ id: m.id, author: m.author, body: m.body, internal: m.internal, at: m.createdAt.toISOString() })),
    logs: logs.map((l) => ({ id: l.id, user: l.userName, summary: l.summary, at: l.createdAt.toISOString() })),
    csatUrl: t.status === "resolved" || t.status === "closed" ? `${publicOrigin(req)}/csat/${t.csatToken}` : null,
    surveyInvite: inv
      ? { surveyId: inv.survey.id, surveyName: inv.survey.name, url: `${publicOrigin(req)}/s/${inv.token}`, channel: inv.channel, submittedAt: inv.submittedAt?.toISOString() ?? null, nps: inv.nps, rating: inv.rating, comment: inv.comment, responseId: inv.id }
      : null,
  });
}

const Patch = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assignee: z.string().max(120).optional(),
  priority: z.enum(PRIORITIES).optional(),
  subject: z.string().min(1).max(200).optional(),
  recordId: z.string().nullable().optional(),
  category: z.string().max(80).optional(),
  teamId: z.string().max(40).nullable().optional(),
});

/** Đổi trạng thái, người phụ trách, mức ưu tiên (tính lại hạn SLA), tiêu đề, khách, phân loại / đội. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = await findTicket(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy phiếu", 404);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dữ liệu chưa hợp lệ");
  const b = p.data;
  const data: Parameters<typeof db.ticket.update>[0]["data"] = {};
  const notes: string[] = [];
  if (b.status && b.status !== t.status) {
    data.status = b.status;
    if (b.status === "resolved" || b.status === "closed") data.resolvedAt = t.resolvedAt ?? new Date();
    else data.resolvedAt = null;
    notes.push(`trạng thái → ${TICKET_STATUS_LABEL[b.status]}`);
  }
  if (b.assignee !== undefined && b.assignee !== t.assignee) {
    data.assignee = b.assignee;
    notes.push(b.assignee ? `giao cho ${b.assignee}` : "bỏ giao");
  }
  if (b.priority && b.priority !== t.priority) {
    data.priority = b.priority;
    // Đổi mức ưu tiên thì tính lại hạn từ lúc tạo phiếu, và cho phép leo thang lại.
    data.dueAt = slaDueAt(b.priority, await ticketPref(a.ctx.workspace.id), t.createdAt);
    data.escalatedAt = null;
    notes.push(`ưu tiên → ${PRIORITY_LABEL[b.priority]}`);
  }
  if (b.subject && b.subject !== t.subject) {
    data.subject = b.subject;
    notes.push("sửa tiêu đề");
  }
  if (b.category !== undefined && b.category.trim() !== t.category) {
    data.category = b.category.trim();
    notes.push(data.category ? `phân loại → ${data.category}` : "bỏ phân loại");
    // Đổi phân loại thì chuyển đội theo luật phân luồng (trừ khi cùng lúc chọn đội cụ thể). Không đổi người xử lý.
    if (b.teamId === undefined) {
      const r = await routeTicket(a.ctx.workspace.id, { category: data.category, assignee: t.assignee || "-" });
      if (r.teamId !== t.teamId) data.teamId = r.teamId;
    }
  }
  if (b.teamId !== undefined && (b.teamId || null) !== t.teamId) {
    if (b.teamId && !(await db.team.findFirst({ where: { id: b.teamId, workspaceId: a.ctx.workspace.id }, select: { id: true } }))) return fail("Không tìm thấy đội", 404);
    data.teamId = b.teamId || null;
  }
  if (data.teamId !== undefined) notes.push(data.teamId ? `chuyển đội ${(await db.team.findFirst({ where: { id: data.teamId as string }, select: { name: true } }))?.name ?? ""}` : "bỏ đội");
  if (b.recordId !== undefined && b.recordId !== t.recordId) {
    if (b.recordId && !(await db.record.findFirst({ where: { id: b.recordId, workspaceId: a.ctx.workspace.id }, select: { id: true } }))) return fail("Không tìm thấy khách", 404);
    data.recordId = b.recordId;
    notes.push(b.recordId ? "gắn khách" : "bỏ gắn khách");
  }
  if (!notes.length) return ok({ ticket: ticketDTO(t, await titlesOf([t.recordId])) });
  const u = await db.ticket.update({ where: { id: t.id }, data });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "ticket.update", "ticket", t.id, `Phiếu ${t.number}: ${notes.join(", ")}`, diffOf({ status: t.status, assignee: t.assignee, priority: t.priority, subject: t.subject }, { status: u.status, assignee: u.assignee, priority: u.priority, subject: u.subject }));
  if (data.assignee) await notifyAssignee(a.ctx.workspace.id, u, a.ctx.user.name);
  if (data.status && u.recordId && (u.status === "resolved" || u.status === "closed")) {
    await db.activity.create({ data: { recordId: u.recordId, kind: "update", body: `Phiếu ${u.number} ${u.status === "resolved" ? "đã xử lý" : "đã đóng"}: ${u.subject}`, author: a.ctx.user.name } });
    if (u.status === "resolved") await sendTicketSurvey(u);
  }
  return ok({ ticket: ticketDTO(u, await titlesOf([u.recordId])), csatUrl: u.status === "resolved" || u.status === "closed" ? `${publicOrigin(req)}/csat/${u.csatToken}` : null });
}

/** Xoá phiếu: chỉ chủ/quản lý. */
export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!can(await getRole(a.ctx.user.id, a.ctx.workspace.id), "delete")) return fail("Chỉ chủ hoặc quản lý xoá được phiếu", 403);
  const t = await findTicket(a.ctx, (await params).id);
  if (!t) return fail("Không tìm thấy phiếu", 404);
  await db.ticket.delete({ where: { id: t.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "ticket.delete", "ticket", t.id, `Xoá phiếu ${t.number} “${t.subject}”`);
  return ok({ ok: true });
}
