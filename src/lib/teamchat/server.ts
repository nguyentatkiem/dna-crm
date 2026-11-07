// Chat nội bộ — phía server: hội thoại 1-1 và nhóm, tin nhắn, đã đọc, đính kèm khách/đơn/việc/phiếu theo quyền.
import type { ChatMessage, ChatThread } from "@prisma/client";
import { db } from "../db";
import { notify } from "../notify";
import { accessOf, recordScope, taskScope } from "../permissions";
import { docScope } from "../sales/access";
import { ticketScope } from "../care/server";
import { mentionTargets } from "./rules";
import { canModify, dmMembers, matchesSearch, parseMembers, parseReadBy, parseRefMeta, preview, shouldNotifyDm, threadTitle, withRead, type Ref, type RefCard } from "./shared";

export type ChatCtx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };
export type Member = { id: string; name: string; email: string; role: string };

export type ThreadDTO = {
  id: string | null; // null = DM chưa có tin nào (tạo khi gửi tin đầu tiên)
  kind: "dm" | "group";
  title: string;
  members: string[];
  dmWith: string | null;
  lastText: string;
  lastAt: string | null;
  unread: number;
  createdBy: string;
  canManage: boolean;
};

export type MessageDTO = {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  refs: RefCard[];
  readBy: string[];
  canModify: boolean;
};

export async function workspaceMembers(workspaceId: string): Promise<Member[]> {
  const ms = await db.membership.findMany({ where: { workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true } } } });
  return ms.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/** Hội thoại mà người dùng là thành viên (lọc thô bằng chuỗi JSON rồi kiểm lại sau khi parse). */
async function rawThreads(ctx: ChatCtx) {
  const rows = await db.chatThread.findMany({ where: { workspaceId: ctx.workspace.id, membersJson: { contains: `"${ctx.user.id}"` } }, orderBy: { lastAt: "desc" }, take: 500 });
  return rows.filter((t) => parseMembers(t.membersJson).includes(ctx.user.id));
}

/** Mở một hội thoại nếu người dùng là thành viên; ngoài ra coi như không tồn tại. */
export async function getThread(ctx: ChatCtx, id: string): Promise<ChatThread | null> {
  const t = await db.chatThread.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  return t && parseMembers(t.membersJson).includes(ctx.user.id) ? t : null;
}

/** Số tin chưa đọc theo hội thoại. */
export async function unreadByThread(ctx: ChatCtx, threadIds: string[]): Promise<Map<string, number>> {
  if (!threadIds.length) return new Map();
  const rows = await db.chatMessage.groupBy({
    by: ["threadId"],
    where: { threadId: { in: threadIds }, NOT: [{ userId: ctx.user.id }, { readByJson: { contains: `"${ctx.user.id}"` } }, { refJson: { contains: '"deleted":true' } }] },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.threadId, r._count._all]));
}

export async function totalUnread(ctx: ChatCtx) {
  const ts = await rawThreads(ctx);
  let n = 0;
  for (const v of (await unreadByThread(ctx, ts.map((t) => t.id))).values()) n += v;
  return n;
}

export async function canManageThread(ctx: ChatCtx, t: Pick<ChatThread, "kind" | "createdBy">) {
  if (t.kind !== "group") return false;
  return t.createdBy === ctx.user.id || (await accessOf(ctx)).isOwner;
}

/** Danh sách hội thoại: nhóm + DM đã có + DM "ảo" với mọi thành viên chưa nhắn lần nào. */
export async function listThreads(ctx: ChatCtx, members: Member[]): Promise<ThreadDTO[]> {
  const names = new Map(members.map((m) => [m.id, m.name]));
  const ts = await rawThreads(ctx);
  const unread = await unreadByThread(ctx, ts.map((t) => t.id));
  const isOwner = (await accessOf(ctx)).isOwner;
  const out: ThreadDTO[] = ts.map((t) => {
    const mem = parseMembers(t.membersJson);
    const dmWith = t.kind === "dm" ? (mem.find((u) => u !== ctx.user.id) ?? ctx.user.id) : null;
    return {
      id: t.id,
      kind: t.kind === "group" ? "group" : "dm",
      title: threadTitle(t, ctx.user.id, names),
      members: mem,
      dmWith,
      lastText: t.lastText,
      lastAt: t.lastText ? t.lastAt.toISOString() : null,
      unread: unread.get(t.id) ?? 0,
      createdBy: t.createdBy,
      canManage: t.kind === "group" && (t.createdBy === ctx.user.id || isOwner),
    };
  });
  // Bỏ DM với người đã rời workspace khỏi danh sách nếu không còn tin chưa đọc.
  const visible = out.filter((t) => t.kind === "group" || names.has(t.dmWith!) || t.unread > 0);
  const haveDm = new Set(visible.filter((t) => t.kind === "dm").map((t) => t.dmWith));
  for (const m of members) {
    if (m.id === ctx.user.id || haveDm.has(m.id)) continue;
    visible.push({ id: null, kind: "dm", title: m.name, members: dmMembers(ctx.user.id, m.id), dmWith: m.id, lastText: "", lastAt: null, unread: 0, createdBy: "", canManage: false });
  }
  return visible;
}

/** Tìm hoặc tạo DM với một thành viên trong workspace. */
export async function ensureDm(ctx: ChatCtx, otherId: string): Promise<ChatThread | null> {
  const isMember = await db.membership.findUnique({ where: { userId_workspaceId: { userId: otherId, workspaceId: ctx.workspace.id } } });
  if (!isMember) return null;
  const membersJson = JSON.stringify(dmMembers(ctx.user.id, otherId));
  const found = await db.chatThread.findFirst({ where: { workspaceId: ctx.workspace.id, kind: "dm", membersJson } });
  if (found) return found;
  return db.chatThread.create({ data: { workspaceId: ctx.workspace.id, kind: "dm", membersJson, createdBy: ctx.user.id, lastAt: new Date(0) } });
}

// ───────────────────────────── Đính kèm theo quyền ─────────────────────────────

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;

/**
 * Giải tham chiếu thành thẻ theo quyền CỦA NGƯỜI XEM: mục ngoài phạm vi (hoặc đã xoá) trả ok=false,
 * không lộ tiêu đề / số tiền. Gom theo loại để mỗi loại một truy vấn.
 */
export async function resolveRefs(ctx: ChatCtx, refs: Ref[]): Promise<Map<string, RefCard>> {
  const out = new Map<string, RefCard>();
  const key = (r: Ref) => `${r.kind}:${r.id}`;
  const ids = (k: Ref["kind"]) => [...new Set(refs.filter((r) => r.kind === k).map((r) => r.id))];
  const rec = ids("record");
  const ord = ids("order");
  const tsk = ids("task");
  const tkt = ids("ticket");

  if (rec.length) {
    const rows = await db.record.findMany({ where: { AND: [await recordScope(ctx), { id: { in: rec }, deletedAt: null }] }, select: { id: true, title: true, objectKey: true, status: true, ownerName: true, amount: true } });
    const cfg = await db.workspaceConfig.findFirst({ where: { workspaceId: ctx.workspace.id, isActive: true }, select: { configJson: true } });
    const objs = (() => {
      try {
        return (JSON.parse(cfg?.configJson ?? "{}").objects ?? []) as { key: string; itemLabel?: string; label: string; statuses: { key: string; label: string }[] }[];
      } catch {
        return [];
      }
    })();
    for (const r of rows) {
      const o = objs.find((x) => x.key === r.objectKey);
      const st = o?.statuses.find((s) => s.key === r.status)?.label ?? r.status;
      const sub = [o?.itemLabel ? o.itemLabel[0].toUpperCase() + o.itemLabel.slice(1) : o?.label, st, r.ownerName, r.amount ? vnd(r.amount) : ""].filter(Boolean).join(" · ");
      out.set(`record:${r.id}`, { kind: "record", id: r.id, ok: true, title: r.title, sub, href: `/w/b/${r.objectKey}?open=${r.id}` });
    }
  }
  if (ord.length) {
    const s = await docScope(ctx);
    const rows = await db.order.findMany({ where: { AND: [s.where, { id: { in: ord } }] }, select: { id: true, number: true, customerName: true, total: true, status: true } });
    const LABEL: Record<string, string> = { new: "Mới", confirmed: "Đã xác nhận", shipping: "Đang giao", done: "Hoàn tất", cancelled: "Đã huỷ" };
    for (const o of rows) out.set(`order:${o.id}`, { kind: "order", id: o.id, ok: true, title: `Đơn ${o.number}`, sub: [o.customerName, LABEL[o.status] ?? o.status, vnd(o.total)].filter(Boolean).join(" · "), href: `/w/orders/${o.id}` });
  }
  if (tsk.length) {
    const rows = await db.task.findMany({ where: { AND: [await taskScope(ctx, "all"), { id: { in: tsk }, inTrash: false }] }, select: { id: true, title: true, assignee: true, dueAt: true, done: true } });
    for (const t of rows)
      out.set(`task:${t.id}`, {
        kind: "task",
        id: t.id,
        ok: true,
        title: t.title,
        sub: [t.done ? "Đã xong" : "Chưa xong", t.assignee, t.dueAt ? `hạn ${t.dueAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""].filter(Boolean).join(" · "),
        href: `/w/my-work?task=${t.id}`,
      });
  }
  if (tkt.length) {
    const rows = await db.ticket.findMany({ where: { AND: [await ticketScope(ctx), { id: { in: tkt } }] }, select: { id: true, number: true, subject: true, status: true, assignee: true } });
    const LABEL: Record<string, string> = { open: "Mở", pending: "Đang chờ khách", resolved: "Đã xử lý", closed: "Đóng" };
    for (const t of rows) out.set(`ticket:${t.id}`, { kind: "ticket", id: t.id, ok: true, title: `${t.number} · ${t.subject}`, sub: [LABEL[t.status] ?? t.status, t.assignee].filter(Boolean).join(" · "), href: `/w/tickets/${t.id}` });
  }
  for (const r of refs) if (!out.has(key(r))) out.set(key(r), { kind: r.kind, id: r.id, ok: false });
  return out;
}

/** Tìm mục để đính kèm (chỉ trong phạm vi của người gửi). */
export async function searchAttachables(ctx: ChatCtx, kind: string, q: string, objectKey?: string) {
  const text = q.trim();
  if (kind === "record") {
    const rows = await db.record.findMany({
      where: { AND: [await recordScope(ctx), { deletedAt: null, ...(objectKey ? { objectKey } : {}), ...(text ? { title: { contains: text } } : {}) }] },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, objectKey: true, ownerName: true },
    });
    return rows.map((r) => ({ kind: "record" as const, id: r.id, title: r.title, sub: r.ownerName }));
  }
  if (kind === "order") {
    const s = await docScope(ctx);
    const rows = await db.order.findMany({
      where: { AND: [s.where, ...(text ? [{ OR: [{ number: { contains: text } }, { customerName: { contains: text } }] }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, number: true, customerName: true, total: true },
    });
    return rows.map((o) => ({ kind: "order" as const, id: o.id, title: `Đơn ${o.number}`, sub: `${o.customerName} · ${vnd(o.total)}` }));
  }
  if (kind === "task") {
    const rows = await db.task.findMany({ where: { AND: [await taskScope(ctx, "all"), { inTrash: false, ...(text ? { title: { contains: text } } : {}) }] }, orderBy: [{ done: "asc" }, { createdAt: "desc" }], take: 20, select: { id: true, title: true, assignee: true, done: true } });
    return rows.map((t) => ({ kind: "task" as const, id: t.id, title: t.title, sub: [t.done ? "Đã xong" : "Chưa xong", t.assignee].filter(Boolean).join(" · ") }));
  }
  if (kind === "ticket") {
    const rows = await db.ticket.findMany({ where: { AND: [await ticketScope(ctx), ...(text ? [{ OR: [{ subject: { contains: text } }, { number: { contains: text } }] }] : [])] }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, subject: true } });
    return rows.map((t) => ({ kind: "ticket" as const, id: t.id, title: `${t.number} · ${t.subject}`, sub: "" }));
  }
  return [];
}

// ───────────────────────────── Tin nhắn ─────────────────────────────

export async function toMessageDTOs(ctx: ChatCtx, msgs: ChatMessage[], names: Map<string, string>): Promise<MessageDTO[]> {
  const metas = msgs.map((m) => parseRefMeta(m.refJson));
  const cards = await resolveRefs(ctx, metas.flatMap((m) => (m.deleted ? [] : m.refs)));
  const now = Date.now();
  return msgs.map((m, i) => {
    const meta = metas[i];
    return {
      id: m.id,
      userId: m.userId,
      userName: names.get(m.userId) ?? "Thành viên cũ",
      body: meta.deleted ? "" : m.body,
      createdAt: m.createdAt.toISOString(),
      edited: !!meta.edited,
      deleted: !!meta.deleted,
      refs: meta.deleted ? [] : meta.refs.map((r) => cards.get(`${r.kind}:${r.id}`)!).filter(Boolean),
      readBy: parseReadBy(m.readByJson).filter((u) => u !== m.userId),
      canModify: canModify(m, ctx.user.id, now),
    };
  });
}

/** Tin gần nhất (mặc định 60) hoặc trang cũ hơn `before`. Trả theo thứ tự thời gian tăng dần. */
export async function listMessages(ctx: ChatCtx, threadId: string, opts: { before?: Date; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const rows = await db.chatMessage.findMany({ where: { threadId, ...(opts.before ? { createdAt: { lt: opts.before } } : {}) }, orderBy: { createdAt: "desc" }, take: limit + 1 });
  return { rows: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

/** Đánh dấu đã đọc mọi tin của người khác trong hội thoại. */
export async function markRead(ctx: ChatCtx, threadId: string) {
  const unread = await db.chatMessage.findMany({ where: { threadId, NOT: [{ userId: ctx.user.id }, { readByJson: { contains: `"${ctx.user.id}"` } }] }, select: { id: true, readByJson: true, userId: true }, take: 1000 });
  const ops = unread.map((m) => ({ id: m.id, next: withRead(m.readByJson, ctx.user.id) })).filter((x): x is { id: string; next: string } => !!x.next);
  if (ops.length) await db.$transaction(ops.map((o) => db.chatMessage.update({ where: { id: o.id }, data: { readByJson: o.next } })));
  return ops.length;
}

/** Gửi tin: lưu, cập nhật tin cuối của hội thoại, báo người được @nhắc (trong nhóm) và người nhận DM (giãn 2 phút). */
export async function postMessage(ctx: ChatCtx, thread: ChatThread, body: string, refs: Ref[], members: Member[]) {
  const msg = await db.chatMessage.create({ data: { threadId: thread.id, userId: ctx.user.id, body, refJson: JSON.stringify({ refs }), readByJson: JSON.stringify([ctx.user.id]) } });
  await db.chatThread.update({ where: { id: thread.id }, data: { lastText: preview(ctx.user.name, body, refs.length), lastAt: msg.createdAt } });

  const memberIds = parseMembers(thread.membersJson);
  const inThread = members.filter((m) => memberIds.includes(m.id));
  const href = `/w/chat?t=${thread.id}`;
  const title = thread.kind === "group" ? thread.name || "nhóm" : "tin nhắn riêng";
  const snippet = body.length > 120 ? `${body.slice(0, 117)}…` : body || "đã gửi một đính kèm";
  const mentioned = mentionTargets(body, inThread, ctx.user.id);
  for (const m of mentioned) await notify(ctx.workspace.id, { userId: m.id, kind: "mention", text: `${ctx.user.name} nhắc bạn trong “${title}”: ${snippet}`, href });

  if (thread.kind === "dm") {
    const to = memberIds.find((u) => u !== ctx.user.id);
    if (to && !mentioned.some((m) => m.id === to)) {
      const last = await db.notification.findFirst({ where: { workspaceId: ctx.workspace.id, userId: to, kind: "teamchat", href }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (shouldNotifyDm(last?.createdAt)) await notify(ctx.workspace.id, { userId: to, kind: "teamchat", text: `${ctx.user.name} nhắn bạn: ${snippet}`, href });
    }
  }
  return msg;
}

/** Tìm tin trong các hội thoại mình là thành viên (không dấu, 3000 tin gần nhất). */
export async function searchMessages(ctx: ChatCtx, q: string, names: Map<string, string>) {
  const ts = await rawThreads(ctx);
  if (!ts.length || !q.trim()) return [];
  const rows = await db.chatMessage.findMany({ where: { threadId: { in: ts.map((t) => t.id) }, NOT: { refJson: { contains: '"deleted":true' } } }, orderBy: { createdAt: "desc" }, take: 3000, select: { id: true, threadId: true, userId: true, body: true, createdAt: true } });
  return rows
    .filter((m) => matchesSearch(m.body, q))
    .slice(0, 50)
    .map((m) => {
      const t = ts.find((x) => x.id === m.threadId)!;
      return { id: m.id, threadId: m.threadId, threadTitle: threadTitle(t, ctx.user.id, names), userName: names.get(m.userId) ?? "", body: m.body.slice(0, 300), createdAt: m.createdAt.toISOString() };
    });
}

