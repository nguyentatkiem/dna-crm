// Gửi hàng loạt: chọn người nhận theo nhóm khách, lọc người đã huỷ/thiếu địa chỉ/trùng, gửi theo lô có thể chạy tiếp sau khi khởi động lại.
import type { Broadcast, Record as DbRecord } from "@prisma/client";
import { getPref, setPref } from "../prefs";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import { getSettings } from "../settings";
import { normPhone } from "../sources/ingest";
import { resolveSegment } from "../care/segments";
import { channelReady, dryRun, sendMessage, type SendResult } from "./messaging";
import { contactInfo, loadCfg } from "./store";
import { CHANNEL_LABEL, fillVars, type VarValues } from "./shared";
import { clickUrl, openUrl, rewriteLinks, unsubToken } from "./tokens";

export type BChannel = "email" | "zns" | "sms" | "zalo";
export const B_CHANNELS: BChannel[] = ["email", "zns", "sms", "zalo"];
export const isBChannel = (c: unknown): c is BChannel => typeof c === "string" && (B_CHANNELS as string[]).includes(c);

export const B_STATUS: Record<string, [string, string]> = {
  draft: ["Nháp", "#c4c4c4"],
  scheduled: ["Đã hẹn giờ", "#579bfc"],
  sending: ["Đang gửi", "#fdab3d"],
  done: ["Đã xong", "#00c875"],
  cancelled: ["Đã huỷ", "#676879"],
};

/** Số tin tối đa mỗi lượt chạy cho một đợt, và khoảng nghỉ giữa hai tin (ms) để không bị nhà mạng chặn. */
export const BATCH = 30;
const THROTTLE_MS = 150;

export type Contact = { id: string; title: string; phone: string; email: string; zaloUid: string; owner: string };

// ---------------- Lọc người nhận (thuần) ----------------

/** Chuẩn hoá địa chỉ theo kênh để so trùng và so với danh sách huỷ. */
export function normAddress(channel: string, a: string) {
  const v = String(a ?? "").trim();
  if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : "";
  if (channel === "sms" || channel === "zns") return normPhone(v);
  return v;
}

export function addressOf(c: Contact, channel: string) {
  return normAddress(channel, channel === "email" ? c.email : channel === "zalo" ? c.zaloUid : c.phone);
}

export type Plan = { send: { contact: Contact; to: string }[]; missing: Contact[]; unsubscribed: Contact[]; duplicate: Contact[] };

/** Chia người nhận: sẽ gửi / thiếu địa chỉ / đã huỷ nhận tin / trùng địa chỉ (giữ người đầu tiên). */
export function planRecipients(contacts: Contact[], channel: string, unsub: Set<string>): Plan {
  const plan: Plan = { send: [], missing: [], unsubscribed: [], duplicate: [] };
  const seenIds = new Set<string>();
  const seen = new Set<string>();
  for (const c of contacts) {
    if (seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    const to = addressOf(c, channel);
    if (!to) plan.missing.push(c);
    else if (unsub.has(to)) plan.unsubscribed.push(c);
    else if (seen.has(to)) plan.duplicate.push(c);
    else {
      seen.add(to);
      plan.send.push({ contact: c, to });
    }
  }
  return plan;
}

export const planCounts = (p: Plan) => ({
  total: p.send.length + p.missing.length + p.unsubscribed.length + p.duplicate.length,
  send: p.send.length,
  missing: p.missing.length,
  unsubscribed: p.unsubscribed.length,
  duplicate: p.duplicate.length,
});

// ---------------- Nội dung ----------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Rendered = { subject: string; text: string; html?: string; unsubUrl?: string };

/**
 * Dựng nội dung cho một người nhận. Có broadcastId + recordId thì gắn theo dõi mở/nhấp (chỉ email).
 * Email luôn có chân trang huỷ nhận tin; SMS có thêm một dòng ngắn khi biết địa chỉ công khai của CRM.
 */
export function renderMessage(
  input: { channel: string; subject: string; body: string },
  vars: Partial<VarValues>,
  ctx: { origin: string; workspaceId: string; to: string; broadcastId?: string; recordId?: string },
): Rendered {
  const subject = fillVars(input.subject, vars);
  let text = fillVars(input.body, vars);
  const unsubUrl = ctx.origin && ctx.to ? `${ctx.origin}/u/${unsubToken({ workspaceId: ctx.workspaceId, channel: input.channel, address: ctx.to })}` : undefined;
  if (input.channel === "sms") {
    if (unsubUrl) text += `\nTu choi nhan tin: ${unsubUrl}`;
    return { subject: "", text, unsubUrl };
  }
  if (input.channel !== "email") return { subject: "", text, unsubUrl };

  const track = !!(ctx.origin && ctx.broadcastId && ctx.recordId);
  const tracked = track ? rewriteLinks(text, (u) => clickUrl(ctx.origin, ctx.broadcastId!, ctx.recordId!, u)) : text;
  const footer = unsubUrl ? `\n\n—\nBạn nhận email này vì đã để lại thông tin với ${vars.ten_doanh_nghiep ?? "chúng tôi"}. Ngừng nhận email: ${unsubUrl}` : "";
  // HTML: chữ hiển thị là link gốc, href là link theo dõi.
  const htmlBody = rewriteLinks(text, (u) => `\u0000${u}\u0001`)
    .split(/(\u0000[^\u0001]*\u0001)/)
    .map((part) => {
      if (!part.startsWith("\u0000")) return esc(part);
      const u = part.slice(1, -1);
      const href = track ? clickUrl(ctx.origin, ctx.broadcastId!, ctx.recordId!, u) : u;
      return `<a href="${esc(href)}" style="color:#0073ea">${esc(u)}</a>`;
    })
    .join("")
    .replace(/\n/g, "<br>");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#323338">
<div style="max-width:600px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:8px;padding:24px;font-size:15px;line-height:1.6">${htmlBody}</div>
${unsubUrl ? `<p style="font-size:12px;color:#676879;text-align:center;margin-top:16px">Bạn nhận email này vì đã để lại thông tin với ${esc(vars.ten_doanh_nghiep ?? "chúng tôi")}.<br><a href="${unsubUrl}" style="color:#676879">Ngừng nhận email</a></p>` : ""}
${track ? `<img src="${openUrl(ctx.origin, ctx.broadcastId!, ctx.recordId!)}" width="1" height="1" alt="" style="display:block;border:0">` : ""}</div></body></html>`;
  return { subject, text: tracked + footer, html, unsubUrl };
}

// ---------------- Người nhận từ CRM ----------------

/** Địa chỉ công khai của CRM để chèn link. Đặt APP_URL khi chạy thật; nếu không thì lấy lần cuối quản lý mở trang. */
export async function publicOrigin(workspaceId: string) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return (await getPref(workspaceId, "site", { origin: "" })).origin;
}

// Lưu ở Pref "site" (không lẫn với khoá kết nối trong settingsJson, nơi mọi giá trị bị coi là bí mật và che đi).
export async function rememberOrigin(workspaceId: string, origin: string) {
  if (process.env.APP_URL || !/^https?:\/\/[^/]+$/.test(origin)) return;
  if ((await getPref(workspaceId, "site", { origin: "" })).origin === origin) return;
  await setPref(workspaceId, "site", { origin });
}

export const originOf = (req: Request) => {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")}://${host}` : new URL(req.url).origin;
};

/** Khách của nhóm (hoặc mọi khách), theo thứ tự tạo để kết quả lọc trùng ổn định giữa các lượt. */
export async function audienceContacts(workspaceId: string, cfg: WorkspaceConfig, segmentId: string | null | undefined): Promise<Contact[]> {
  let rows: DbRecord[];
  if (segmentId) rows = await resolveSegment(workspaceId, segmentId);
  else rows = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 20000 });
  const obj = getObject(cfg, "contacts");
  const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj?.fields.find((f) => f.type === "email")?.key;
  const out: Contact[] = [];
  for (const r of rows) {
    if (r.objectKey === "contacts") {
      const d = parseJson<Record<string, unknown>>(r.dataJson, {});
      out.push({ id: r.id, title: r.title, phone: phoneKey ? String(d[phoneKey] ?? "") : "", email: emailKey ? String(d[emailKey] ?? "") : "", zaloUid: typeof d._zalo_uid === "string" ? d._zalo_uid : "", owner: r.ownerName });
    } else {
      // Nhóm khách dựng trên bảng bán hàng: lấy liên hệ của khách liên quan.
      const i = await contactInfo(workspaceId, cfg, r);
      out.push({ id: i.contact?.id ?? r.id, title: i.name, phone: i.phone, email: i.email, zaloUid: i.zaloUid, owner: i.owner });
    }
  }
  return out;
}

export async function unsubSet(workspaceId: string, channel: string) {
  const rows = await db.unsubscribe.findMany({ where: { workspaceId, channel }, select: { address: true } });
  return new Set(rows.map((r) => normAddress(channel, r.address) || r.address));
}

const varsFor = (c: Contact | undefined, cfg: WorkspaceConfig): VarValues => ({
  ten: c?.title ?? "",
  ten_doanh_nghiep: cfg.businessName,
  so_dien_thoai: c?.phone ?? "",
  nguoi_phu_trach: c?.owner || cfg.team[0] || "",
});

export type Draft = { channel: BChannel; segmentId?: string | null; subject: string; body: string; templateId?: string };

/** Đếm người nhận và dựng tin đầu tiên cho một khách thật, để xem trước khi gửi. */
export async function previewBroadcast(workspaceId: string, cfg: WorkspaceConfig, d: Draft) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const [contacts, unsub, origin] = await Promise.all([audienceContacts(workspaceId, cfg, d.segmentId), unsubSet(workspaceId, d.channel), publicOrigin(workspaceId)]);
  const plan = planRecipients(contacts, d.channel, unsub);
  const first = plan.send[0];
  const sampleContact = first?.contact ?? contacts[0];
  const r = renderMessage(d, varsFor(sampleContact, cfg), { origin, workspaceId, to: first?.to ?? "" });
  return {
    counts: planCounts(plan),
    notReady: channelReady(getSettings(ws), d.channel, d.templateId),
    dryRun: dryRun(),
    sample: sampleContact ? { name: sampleContact.title, to: first?.to ?? "", subject: r.subject, body: r.text, html: r.html ?? "" } : null,
    missingNames: plan.missing.slice(0, 5).map((c) => c.title),
  };
}

// ---------------- Gửi ----------------

/** Gửi một tin của đợt. Email thật gửi bản HTML (có pixel mở); còn lại đi qua sendMessage để ghi nhật ký giống kịch bản. */
async function deliver(workspaceId: string, cfg: WorkspaceConfig, b: Pick<Broadcast, "channel" | "subject" | "body" | "templateId"> & { id?: string }, to: string, contact: Contact | undefined, origin: string): Promise<SendResult> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const s = getSettings(ws);
  const vars = varsFor(contact, cfg);
  const r = renderMessage(b, vars, { origin, workspaceId, to, broadcastId: b.id, recordId: contact?.id || undefined });
  const channel = b.channel as BChannel;
  const rid = contact?.id || undefined;
  const base = { channel, recordId: rid, broadcastId: b.id, to, subject: r.subject, body: r.text, templateId: b.templateId || undefined };
  if (channel !== "email" || dryRun() || channelReady(s, "email") || !r.html) return sendMessage(workspaceId, base);

  const log = async (status: "sent" | "failed", error = "") => {
    await db.outMessage.create({ data: { workspaceId, recordId: rid, broadcastId: b.id, channel, to: to.slice(0, 200), subject: r.subject.slice(0, 300), body: r.text.slice(0, 5000), status, error: error.slice(0, 500), provider: "email" } });
    if (rid) {
      const head = status === "sent" ? `Đã gửi ${CHANNEL_LABEL.email}` : `Gửi ${CHANNEL_LABEL.email} lỗi: ${error}`;
      await db.activity.create({ data: { recordId: rid, kind: "message", body: `${head}\n${r.subject}\n${fillVars(b.body, vars).slice(0, 1000)}`, author: "Marketing" } });
    }
  };
  try {
    const e = s.email!;
    const port = Number(e.port) || 587;
    // Nạp lúc chạy giống messaging.ts để không làm hỏng bản build edge.
    const nodemailer = (await import(/* webpackIgnore: true */ "nodemailer" as string)) as typeof import("nodemailer");
    const tr = (nodemailer.default ?? nodemailer).createTransport({ host: e.host, port, secure: port === 465, auth: { user: e.user, pass: e.pass } });
    await tr.sendMail({
      from: e.from || e.user,
      to,
      subject: r.subject || `Thông tin từ ${vars.ten_doanh_nghiep}`,
      text: r.text,
      html: r.html,
      headers: r.unsubUrl ? { "List-Unsubscribe": `<${r.unsubUrl}>` } : undefined,
    });
    await log("sent");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await log("failed", msg);
    return { ok: false, error: msg };
  }
}

/** "Gửi thử cho tôi": dựng tin như khách đầu tiên của nhóm, gửi tới địa chỉ nhập tay, không tính vào đợt gửi. */
export async function sendTest(workspaceId: string, cfg: WorkspaceConfig, d: Draft, to: string) {
  const address = normAddress(d.channel, to) || to.trim();
  if (!address) return { ok: false, error: d.channel === "email" ? "Email chưa đúng" : d.channel === "zalo" ? "Hãy nhập Zalo user id" : "Số điện thoại chưa đúng" };
  const [contacts, origin] = await Promise.all([audienceContacts(workspaceId, cfg, d.segmentId), publicOrigin(workspaceId)]);
  const sample = contacts[0];
  const res = await deliver(workspaceId, cfg, { channel: d.channel, subject: d.subject ? `[Thử] ${d.subject}` : "[Thử]", body: d.body, templateId: d.templateId ?? "" }, address, sample ? { ...sample, id: "" } : undefined, origin);
  return res;
}

/** Đếm lại số liệu đợt gửi từ OutMessage (nguồn sự thật), cộng thêm số bị bỏ qua trước khi gửi. */
async function recount(b: Broadcast, plan: Plan) {
  const g = await db.outMessage.groupBy({ by: ["status"], where: { broadcastId: b.id }, _count: { _all: true } });
  const n = (s: string) => g.find((x) => x.status === s)?._count._all ?? 0;
  const pre = plan.missing.length + plan.unsubscribed.length + plan.duplicate.length;
  return { total: planCounts(plan).total, sent: n("sent") + n("dry_run"), failed: n("failed"), skipped: n("skipped") + pre };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gửi một lô của một đợt. Ai đã có OutMessage của đợt này (theo recordId hoặc địa chỉ) thì bỏ qua, nên chạy lại không gửi trùng. */
export async function runBroadcastBatch(b: Broadcast, cfgs = new Map<string, WorkspaceConfig | null>()) {
  if (!cfgs.has(b.workspaceId)) cfgs.set(b.workspaceId, await loadCfg(b.workspaceId));
  const cfg = cfgs.get(b.workspaceId);
  if (!cfg) return 0;
  if (b.status === "scheduled") await db.broadcast.update({ where: { id: b.id }, data: { status: "sending", startedAt: b.startedAt ?? new Date() } });

  const [contacts, unsub, done, origin] = await Promise.all([
    audienceContacts(b.workspaceId, cfg, b.segmentId),
    unsubSet(b.workspaceId, b.channel),
    db.outMessage.findMany({ where: { broadcastId: b.id }, select: { recordId: true, to: true } }),
    publicOrigin(b.workspaceId),
  ]);
  const plan = planRecipients(contacts, b.channel, unsub);
  const doneIds = new Set(done.map((m) => m.recordId).filter(Boolean));
  const doneTo = new Set(done.map((m) => normAddress(b.channel, m.to) || m.to));
  const remaining = plan.send.filter((r) => !doneIds.has(r.contact.id) && !doneTo.has(r.to));
  const batch = remaining.slice(0, BATCH);

  let n = 0;
  let cancelled = false;
  for (const r of batch) {
    const cur = await db.broadcast.findUnique({ where: { id: b.id }, select: { status: true } });
    if (!cur || cur.status === "cancelled") {
      cancelled = true;
      break;
    }
    await deliver(b.workspaceId, cfg, b, r.to, r.contact, origin).catch(async (e) => {
      // Lỗi bất ngờ vẫn ghi lại để lượt sau không gửi lại người này.
      await db.outMessage.create({ data: { workspaceId: b.workspaceId, recordId: r.contact.id, broadcastId: b.id, channel: b.channel, to: r.to, body: b.body.slice(0, 5000), status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 500) } });
    });
    n++;
    if (THROTTLE_MS) await sleep(THROTTLE_MS);
  }
  const c = await recount(b, plan);
  const finished = !cancelled && remaining.length <= batch.length;
  await db.broadcast.update({
    where: { id: b.id },
    data: { ...c, ...(finished ? { status: "done", finishedAt: new Date() } : {}) },
  });
  return n;
}

const g = globalThis as unknown as { crmBroadcastBusy?: boolean };

/** Việc nền (gợi ý: mỗi 1 phút): gửi các đợt đến giờ, tối đa BATCH tin mỗi đợt mỗi lượt. */
export async function tickBroadcasts(only?: { workspaceId?: string; id?: string }): Promise<void> {
  if (g.crmBroadcastBusy) return;
  g.crmBroadcastBusy = true;
  try {
    const due = await db.broadcast.findMany({
      where: { OR: [{ status: "scheduled", scheduledAt: { lte: new Date() } }, { status: "sending" }], ...(only?.workspaceId ? { workspaceId: only.workspaceId } : {}), ...(only?.id ? { id: only.id } : {}) },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    const cfgs = new Map<string, WorkspaceConfig | null>();
    for (const b of due) {
      await runBroadcastBatch(b, cfgs).catch((e) => console.error("[broadcast]", b.id, e instanceof Error ? e.message : e));
    }
  } finally {
    g.crmBroadcastBusy = false;
  }
}

/** Ghi nhận mở/nhấp một lần cho mỗi người nhận: dấu vết là một Activity trên khách (kind email_open / email_click). */
export async function trackOnce(kind: "open" | "click", broadcastId: string, recordId: string) {
  const b = await db.broadcast.findUnique({ where: { id: broadcastId }, select: { id: true, workspaceId: true, name: true } });
  if (!b) return false;
  const rec = await db.record.findFirst({ where: { id: recordId, workspaceId: b.workspaceId }, select: { id: true } });
  if (!rec) return false;
  const k = kind === "open" ? "email_open" : "email_click";
  const tag = `[đợt:${b.id}]`;
  const seen = await db.activity.findFirst({ where: { recordId, kind: k, body: { contains: tag } }, select: { id: true } });
  if (seen) return false;
  await db.activity.create({ data: { recordId, kind: k, body: `${kind === "open" ? "Đã mở" : "Đã nhấp link trong"} email “${b.name}” ${tag}`, author: "Marketing" } });
  // Nhấp link chắc chắn đã mở: tính luôn lượt mở nếu pixel bị chặn.
  if (kind === "click") {
    const opened = await db.activity.findFirst({ where: { recordId, kind: "email_open", body: { contains: tag } }, select: { id: true } });
    if (!opened) {
      await db.activity.create({ data: { recordId, kind: "email_open", body: `Đã mở email “${b.name}” ${tag}`, author: "Marketing" } });
      await db.broadcast.update({ where: { id: b.id }, data: { opened: { increment: 1 } } });
    }
  }
  await db.broadcast.update({ where: { id: b.id }, data: kind === "open" ? { opened: { increment: 1 } } : { clicked: { increment: 1 } } });
  return true;
}
