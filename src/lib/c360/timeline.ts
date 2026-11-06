// Chân dung 360°: thẻ tổng quan và dòng thời gian gộp mọi điểm chạm của một khách.
import type { Record as DbRecord } from "@prisma/client";
import { db } from "../db";
import { getObject } from "../config/schema";
import { getRole } from "../permissions";
import { getPrivacy, maskEmail, maskPhone, shouldMask } from "../privacy";
import { loyaltyOf } from "../care/server";
import { TICKET_STATUS_LABEL, PRIORITY_LABEL, WARRANTY_STATUS_LABEL, type TicketStatus, type Priority } from "../care/shared";
import { ORDER_STATUS, QUOTE_STATUS, CONTRACT_STATUS, PAY_METHOD, money, type OrderStatus, type QuoteStatus, type ContractStatus, type PayMethod } from "../sales/shared";
import { CHANNEL_LABEL, type MsgChannel } from "../marketing/shared";
import { OUTCOMES } from "../calls-shared";
import { dataOf, type C360Ctx } from "./common";
import { mergeTimeline, tlKind, type TimelineItem, type TlKind } from "./kinds";
import { countedOrder } from "./rfm-data";
import { rfmMeta } from "./rfm";
import { scoreBreakdown } from "./behavior";

const iso = (d: Date) => d.toISOString();
const cut = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const item = (id: string, at: Date, kind: TlKind, title: string, detail?: string, href?: string): TimelineItem => ({ id, at: iso(at), kind, icon: tlKind(kind).icon, title, ...(detail ? { detail: cut(detail) } : {}), ...(href ? { href } : {}) });
const ACT_SKIP = new Set(["email_open", "email_click"]);
const INBOX_LABEL: Record<string, string> = { zalo: "Zalo", messenger: "Messenger", facebook: "Facebook" };

/** Hàm che SĐT/email theo vai trò người xem. */
async function masker(ctx: C360Ctx) {
  const role = await getRole(ctx.user.id, ctx.workspace.id);
  const prefs = await getPrivacy(ctx.workspace.id);
  const on = shouldMask(role, prefs);
  return (s: string) => {
    if (!on || !s) return s;
    if (s.includes("@")) return prefs.maskEmail ? maskEmail(s) : s;
    return prefs.maskPhone && /\d{6,}/.test(s.replace(/\D/g, "")) ? maskPhone(s) : s;
  };
}

/** Dòng thời gian của một khách (rec đã được kiểm tra quyền). kinds rỗng = mọi loại. */
export async function timelineOf(ctx: C360Ctx, rec: DbRecord, opts: { before?: string; limit?: number; kinds?: TlKind[] } = {}) {
  const wid = ctx.workspace.id;
  const id = rec.id;
  const limit = Math.min(100, Math.max(5, opts.limit ?? 30));
  const before = opts.before && !isNaN(Date.parse(opts.before)) ? new Date(opts.before) : new Date(Date.now() + 60e3);
  const want = (k: TlKind) => !opts.kinds?.length || opts.kinds.includes(k);
  const mask = await masker(ctx);
  const lt = { lt: before };
  const take = limit + 1;
  const ord = { createdAt: "desc" } as const;
  const linked = { workspaceId: wid, OR: [{ contactId: id }, { recordId: id }] };
  const lists: TimelineItem[][] = [];
  const jobs: Promise<void>[] = [];
  const add = (p: Promise<TimelineItem[]>) => jobs.push(p.then((xs) => void lists.push(xs)));

  if (want("note") || want("email"))
    add(
      db.activity.findMany({ where: { recordId: id, createdAt: lt, ...(want("note") ? (want("email") ? {} : { kind: { notIn: [...ACT_SKIP] } }) : { kind: { in: [...ACT_SKIP] } }) }, orderBy: ord, take }).then((xs) =>
        xs.map((a) => (ACT_SKIP.has(a.kind) ? item(`a${a.id}`, a.createdAt, "email", a.kind === "email_open" ? "Mở email" : "Nhấp link trong email", a.body.replace(/\s*\[đợt:[^\]]+\]/, "")) : item(`a${a.id}`, a.createdAt, "note", cut(a.body.split("\n")[0] || "Cập nhật", 140), [a.author, a.body.includes("\n") ? a.body.slice(a.body.indexOf("\n") + 1) : ""].filter(Boolean).join(" · ")))),
      ),
    );
  if (want("call"))
    add(
      db.call.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((c) => {
          const o = OUTCOMES.find((x) => x.key === c.outcome)?.label ?? c.outcome;
          const dur = c.durationSec ? ` · ${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, "0")}` : "";
          return item(`c${c.id}`, c.createdAt, "call", `${c.direction === "in" ? "Gọi đến" : "Gọi đi"} · ${o}${dur}`, [c.agentName, mask(c.phone), c.summary || c.note].filter(Boolean).join(" · "), "/w/telesales");
        }),
      ),
    );
  if (want("chat"))
    add(
      db.message.findMany({ where: { createdAt: lt, direction: { in: ["in", "out"] }, conversation: { workspaceId: wid, recordId: id } }, orderBy: ord, take, include: { conversation: { select: { id: true, channel: true } } } }).then((xs) =>
        xs.map((m) => item(`m${m.id}`, m.createdAt, "chat", `${m.direction === "in" ? "Khách nhắn" : `${m.author || "Bạn"} trả lời`} qua ${INBOX_LABEL[m.conversation.channel] ?? m.conversation.channel}`, m.text || "(tệp đính kèm)", `/w/inbox?c=${m.conversation.id}`)),
      ),
    );
  if (want("sent"))
    add(
      db.outMessage.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((o) => {
          const ch = CHANNEL_LABEL[o.channel as MsgChannel] ?? o.channel;
          const st = o.status === "sent" ? "Đã gửi" : o.status === "failed" ? "Gửi lỗi" : o.status === "dry_run" ? "Chạy thử" : o.status === "skipped" ? "Bỏ qua" : o.status;
          return item(`o${o.id}`, o.createdAt, "sent", `${st} ${ch}${o.broadcastId ? " (gửi hàng loạt)" : o.sequenceId ? " (kịch bản chăm sóc)" : ""}`, [mask(o.to), o.subject || o.body, o.error].filter(Boolean).join(" · "), o.broadcastId ? `/w/broadcasts/${o.broadcastId}` : undefined);
        }),
      ),
    );
  if (want("sales")) {
    add(
      db.quote.findMany({ where: { ...linked, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.flatMap((q) => {
          const out = [item(`q${q.id}`, q.createdAt, "sales", `Báo giá ${q.number} · ${money(q.total)}`, `${QUOTE_STATUS[q.status as QuoteStatus]?.label ?? q.status}${q.title ? ` · ${q.title}` : ""}`, `/w/quotes/${q.id}`)];
          if (q.viewedAt && q.viewedAt < before) out.push(item(`qv${q.id}`, q.viewedAt, "sales", `Khách xem báo giá ${q.number}`, undefined, `/w/quotes/${q.id}`));
          return out;
        }),
      ),
    );
    add(
      db.order.findMany({ where: { ...linked, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((o) => item(`d${o.id}`, o.createdAt, "sales", `Đơn hàng ${o.number} · ${money(o.total)}`, `${ORDER_STATUS[o.status as OrderStatus]?.label ?? o.status}${o.paid ? ` · đã trả ${money(o.paid)}` : ""}${o.voucherCode ? ` · voucher ${o.voucherCode}` : ""}`, `/w/orders/${o.id}`)),
      ),
    );
    add(
      db.payment.findMany({ where: { workspaceId: wid, paidAt: lt, order: { OR: [{ contactId: id }, { recordId: id }] } }, orderBy: { paidAt: "desc" }, take, include: { order: { select: { id: true, number: true } } } }).then((xs) =>
        xs.map((p) => item(`p${p.id}`, p.paidAt, "sales", `Thanh toán ${money(p.amount)} · ${PAY_METHOD[p.method as PayMethod] ?? p.method}`, `Đơn ${p.order.number}${p.note ? ` · ${p.note}` : ""}`, `/w/orders/${p.order.id}`)),
      ),
    );
    add(
      db.contract.findMany({ where: { ...linked, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((c) => item(`k${c.id}`, c.createdAt, "sales", `Hợp đồng ${c.number} · ${c.title}`, `${CONTRACT_STATUS[c.status as ContractStatus]?.label ?? c.status}${c.value ? ` · ${money(c.value)}` : ""}`, "/w/contracts")),
      ),
    );
  }
  if (want("care")) {
    add(
      db.ticket.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((t) => item(`t${t.id}`, t.createdAt, "care", `Phiếu ${t.number} · ${t.subject}`, `${TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status} · ưu tiên ${PRIORITY_LABEL[t.priority as Priority]?.toLowerCase() ?? t.priority}${t.csat ? ` · CSAT ${t.csat}/5` : ""}`, `/w/tickets/${t.id}`)),
      ),
    );
    add(
      db.warranty.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((w) => item(`w${w.id}`, w.createdAt, "care", `Bảo hành ${w.productName}`, [WARRANTY_STATUS_LABEL[w.status] ?? w.status, w.serial && `serial ${w.serial}`, `đến ${w.endAt.toLocaleDateString("vi-VN")}`].filter(Boolean).join(" · "), "/w/warranty")),
      ),
    );
  }
  if (want("loyalty")) {
    add(
      db.loyaltyTxn.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((t) => item(`l${t.id}`, t.createdAt, "loyalty", `${t.points > 0 ? "+" : ""}${t.points.toLocaleString("vi-VN")} điểm thưởng`, t.reason)),
      ),
    );
    add(
      db.voucher.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take, include: { campaign: { select: { name: true } } } }).then((xs) =>
        xs.flatMap((v) => {
          const out = [item(`v${v.id}`, v.createdAt, "loyalty", `Nhận voucher ${v.code}`, [v.campaign.name, v.reason, v.sentVia && `gửi qua ${v.sentVia}`].filter(Boolean).join(" · "))];
          if (v.usedAt && v.usedAt < before) out.push(item(`vu${v.id}`, v.usedAt, "loyalty", `Dùng voucher ${v.code}`, v.discount ? `Giảm ${money(v.discount)}` : undefined, v.usedOrderId ? `/w/orders/${v.usedOrderId}` : undefined));
          return out;
        }),
      ),
    );
  }
  if (want("survey"))
    add(
      db.surveyResponse.findMany({ where: { workspaceId: wid, recordId: id, sentAt: lt }, orderBy: { sentAt: "desc" }, take, include: { survey: { select: { name: true } } } }).then((xs) =>
        xs.map((s) =>
          s.submittedAt
            ? item(`s${s.id}`, s.submittedAt < before ? s.submittedAt : s.sentAt, "survey", `Trả lời khảo sát “${s.survey.name}”`, [s.nps != null && `NPS ${s.nps}/10`, s.rating != null && `đánh giá ${s.rating}`, s.comment].filter(Boolean).join(" · "))
            : item(`s${s.id}`, s.sentAt, "survey", `Đã gửi khảo sát “${s.survey.name}”`, `Qua ${s.channel}, chưa trả lời`),
        ),
      ),
    );
  if (want("lead"))
    add(
      db.leadEvent.findMany({ where: { workspaceId: wid, recordId: id, createdAt: lt }, orderBy: ord, take }).then((xs) =>
        xs.map((l) => item(`e${l.id}`, l.createdAt, "lead", `${l.status === "merged" ? "Quay lại qua" : "Đến từ"} ${l.provider}${l.channel && l.channel !== l.provider ? ` · ${l.channel}` : ""}`, l.message, "/w/sources")),
      ),
    );

  await Promise.all(jobs);
  // Mốc "khách được tạo" luôn ở cuối dòng thời gian.
  if (want("note") && rec.createdAt < before) lists.push([item(`r${rec.id}`, rec.createdAt, "note", "Tạo hồ sơ khách", rec.ownerName ? `Phụ trách: ${rec.ownerName}` : undefined)]);
  return mergeTimeline(lists, limit);
}

/** Thẻ tổng quan: chi tiêu, đơn, hỗ trợ, khảo sát, điểm thưởng, điểm AI, nhóm RFM, kênh đã dùng. */
export async function summaryOf(ctx: C360Ctx, rec: DbRecord) {
  const wid = ctx.workspace.id;
  const id = rec.id;
  const linked = { workspaceId: wid, OR: [{ contactId: id }, { recordId: id }] };
  const [orders, tickets, nps, loyalty, calls, convs, outs, leads, breakdown] = await Promise.all([
    db.order.findMany({ where: linked, select: { status: true, paid: true, total: true, createdAt: true } }),
    db.ticket.findMany({ where: { workspaceId: wid, recordId: id }, select: { status: true, csat: true, channel: true } }),
    db.surveyResponse.findFirst({ where: { workspaceId: wid, recordId: id, submittedAt: { not: null }, nps: { not: null } }, orderBy: { submittedAt: "desc" }, select: { nps: true, submittedAt: true } }),
    loyaltyOf(wid, [id]),
    db.call.count({ where: { workspaceId: wid, recordId: id } }),
    db.conversation.findMany({ where: { workspaceId: wid, recordId: id }, select: { channel: true } }),
    db.outMessage.groupBy({ by: ["channel"], where: { workspaceId: wid, recordId: id, status: "sent" } }),
    db.leadEvent.findMany({ where: { workspaceId: wid, recordId: id }, select: { provider: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    scoreBreakdown(wid, id, ctx.config),
  ]);
  const done = orders.filter(countedOrder);
  const totalSpent = done.reduce((s, o) => s + o.total, 0);
  const lastOrder = done.reduce((m, o) => Math.max(m, o.createdAt.getTime()), 0);
  const csat = tickets.map((t) => t.csat).filter((x): x is number => typeof x === "number");
  const ly = loyalty.map.get(id);
  const d = dataOf(rec);
  const rfm = rfmMeta(typeof d._rfm === "string" ? d._rfm : "");
  const channels = new Set<string>();
  if (calls) channels.add("Điện thoại");
  for (const c of convs) channels.add(INBOX_LABEL[c.channel] ?? c.channel);
  for (const o of outs) channels.add(CHANNEL_LABEL[o.channel as MsgChannel] ?? o.channel);
  for (const l of leads) channels.add(l.provider);
  if (tickets.some((t) => t.channel === "email")) channels.add("Email");
  const firstSeen = Math.min(rec.createdAt.getTime(), ...leads.map((l) => l.createdAt.getTime()));
  const obj = getObject(ctx.config, "contacts");
  return {
    title: rec.title,
    owner: rec.ownerName,
    status: obj?.statuses.find((s) => s.key === rec.status)?.label ?? rec.status,
    totalSpent,
    orderCount: done.length,
    avgOrder: done.length ? Math.round(totalSpent / done.length) : 0,
    lastOrderAt: lastOrder ? new Date(lastOrder).toISOString() : null,
    firstSeenAt: new Date(firstSeen).toISOString(),
    openTickets: tickets.filter((t) => t.status === "open" || t.status === "pending").length,
    avgCsat: csat.length ? Math.round((csat.reduce((s, x) => s + x, 0) / csat.length) * 10) / 10 : null,
    lastNps: nps?.nps ?? null,
    loyalty: { enabled: loyalty.pref.enabled, balance: ly?.balance ?? 0, earned: ly?.earned ?? 0, tier: ly?.tier ?? loyalty.pref.tiers[0] ?? null },
    score: rec.score,
    scoreBreakdown: breakdown,
    rfm: rfm ? { key: rfm.key, label: rfm.label, color: rfm.color, hint: rfm.hint, code: typeof d._rfm_code === "string" ? d._rfm_code : "" } : null,
    channels: [...channels],
  };
}
