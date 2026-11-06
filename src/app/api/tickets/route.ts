import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { ticketScope } from "@/lib/care/server";
import { createTicket, ticketDTO, titlesOf } from "@/lib/care/tickets";
import { PRIORITIES, TICKET_STATUSES } from "@/lib/care/shared";

/** Danh sách phiếu + số đếm theo trạng thái. Lọc: status, priority, assignee, recordId, q, overdue=1. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const scope = await ticketScope(a.ctx);
  const where: Prisma.TicketWhereInput[] = [scope];
  const priority = sp.get("priority");
  if (priority) where.push({ priority });
  const assignee = sp.get("assignee");
  if (assignee !== null && assignee !== "all") where.push({ assignee: assignee === "none" ? "" : assignee });
  const recordId = sp.get("recordId");
  if (recordId) where.push({ recordId });
  const q = (sp.get("q") ?? "").trim();
  if (q) where.push({ OR: [{ subject: { contains: q } }, { number: { contains: q } }, { body: { contains: q } }] });
  if (sp.get("overdue") === "1") where.push({ status: { in: ["open", "pending"] }, dueAt: { lt: new Date() } });

  const status = sp.get("status") ?? "open";
  // Phiếu đang mở xếp theo hạn gần nhất; phiếu đã xong xếp mới nhất trước.
  const [rows, grouped] = await Promise.all([
    db.ticket.findMany({ where: { AND: [...where, ...(status === "all" ? [] : [{ status }])] }, orderBy: status === "open" || status === "pending" ? [{ dueAt: "asc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }], take: 300 }),
    db.ticket.groupBy({ by: ["status"], where: { AND: where }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(TICKET_STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  const overdue = await db.ticket.count({ where: { AND: [scope, { status: { in: ["open", "pending"] }, dueAt: { lt: new Date() } }] } });
  const titles = await titlesOf(rows.map((r) => r.recordId));
  return ok({ items: rows.map((r) => ticketDTO(r, titles)), counts, overdue });
}

const Body = z.object({
  subject: z.string().max(200).default(""),
  body: z.string().max(20000).optional(),
  recordId: z.string().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().max(120).optional(),
  channel: z.string().max(20).optional(),
  fromConversationId: z.string().optional(),
  fromCallId: z.string().optional(),
});

/** Tạo phiếu. Có fromConversationId/fromCallId thì chép nội dung và gắn khách từ đó. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (!p.data.subject.trim() && !p.data.fromConversationId && !p.data.fromCallId) return fail("Nhập tiêu đề phiếu");
  const t = await createTicket(a.ctx, p.data);
  if ("error" in t) return fail(t.error, 404);
  return ok(ticketDTO(t, await titlesOf([t.recordId])), 201);
}
