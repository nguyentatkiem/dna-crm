import type { Conversation, Prisma, Workspace } from "@prisma/client";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, parseJson } from "./db";
import { ai, MODEL } from "./ai";
import { getObject, type WorkspaceConfig } from "./config/schema";
import { INDUSTRIES } from "./dna";
import { notify, userIdByName } from "./notify";
import { recordScope } from "./permissions";
import { getSettings } from "./settings";
import { ingestLead, loadConfig, normPhone, type Lead } from "./sources/ingest";
import { fireEvent } from "./automation";
import { stopEnrollmentsForRecord } from "./marketing/sequences";
import { getZaloProfile, sendZaloText } from "./zalo";
import { getMessengerProfile, MessengerError, sendMessengerText } from "./messenger";
import { detectContact, type Detected } from "./chat/detect";
import { assignOnIngest } from "./chat/assign";
import { analyzeIncoming } from "./chat/sentiment";
import { conversationWhere } from "./chat/visibility";
import { findDuplicatesFor } from "./c360/dupes";
import { commentAction } from "./fb/comments";
import { appendSignature, effectiveSettings, fillTemplate, findPage, inboxCrmPref, pageSettings, pageTokenFor, postSettings } from "./fb/pages";

// Hộp thư hợp nhất: gom tin Zalo OA và Facebook Messenger về một chỗ, gắn với hồ sơ khách.

export type InboxChannel = "zalo" | "messenger";
export const CHANNEL_LABEL: Record<InboxChannel, string> = { zalo: "Zalo", messenger: "Messenger" };

export type Attachment = { type: string; url?: string; name?: string; lat?: number; lng?: number };

/** Nguồn khách vào hội thoại: quảng cáo (ad_id), link m.me có ref, bài viết, plugin chat website. */
export type InboxReferral = { source: "ad" | "ref" | "post" | "website"; ref: string; adId?: string; postId?: string };

/** Bình luận trên bài viết của trang (webhook "feed", item = comment). */
export type InboxComment = {
  commentId: string;
  /** Bình luận cha; "" nếu bình luận trực tiếp vào bài. */
  parentId: string;
  postId: string;
  /** Mã người bình luận (app-scoped id). */
  senderId: string;
  verb: "add" | "edited" | "remove" | "hide" | "unhide";
  /** Trang tự bình luận / trả lời (direction "out"). */
  fromPage: boolean;
  post?: { kind?: "post" | "photo" | "video" | "live"; live?: boolean; permalink?: string; message?: string; image?: string };
};

/** Bài viết mới / sửa của trang (feed item status/photo/video). Chỉ cập nhật bảng FbPost. */
export type InboxPostEvent = { postId: string; kind: "post" | "photo" | "video" | "live"; live: boolean; message: string; permalink: string; image: string; at?: Date; remove?: boolean };

/** Một tin đã chuẩn hoá từ webhook (Zalo/Facebook đều đổi về dạng này). */
export type InboxEvent = {
  channel: InboxChannel;
  /** Mã người dùng phía nền tảng: Zalo user id hoặc PSID Messenger. Bình luận: c:<postId>:<người bình luận>. */
  externalId: string;
  pageId?: string;
  direction: "in" | "out";
  text: string;
  attachments?: Attachment[];
  /** Mã tin của nền tảng (msg_id / mid) để chống trùng. */
  msgId?: string;
  at?: Date;
  /** Sự kiện hệ thống (quan tâm OA, mở chat từ link m.me...), không tính là khách trả lời. */
  system?: boolean;
  /** Lead tạo/gộp khi hội thoại chưa gắn khách (giữ hành vi Hub nguồn khách cũ). */
  lead?: Lead;
  /** "comment" = bình luận fanpage (xem comment). Mặc định "message". */
  kind?: "message" | "comment";
  /** Tên người gửi nền tảng gửi kèm (bình luận có from.name). */
  name?: string;
  comment?: InboxComment;
  referral?: InboxReferral;
  post?: InboxPostEvent;
};

const ATT_LABEL: Record<string, string> = { image: "Ảnh", file: "Tệp", sticker: "Sticker", location: "Vị trí", audio: "Ghi âm", video: "Video", gif: "Ảnh GIF", link: "Liên kết", event: "Sự kiện" };

/** Đoạn xem trước cho danh sách hội thoại. */
export function preview(text: string, atts: Attachment[] = []) {
  if (text.trim()) return text.trim().slice(0, 200);
  const a = atts[0];
  return a ? `[${ATT_LABEL[a.type] ?? "Tệp đính kèm"}]` : "";
}

/* ───────────────────────────── Nhận tin ───────────────────────────── */

type IngestResult = { conversationId: string; status: "created" | "duplicate" | "updated" | "ignored"; recordId?: string | null };

async function profileOf(ws: Workspace, ev: InboxEvent) {
  if (ev.channel === "zalo") return getZaloProfile(ws.id, ev.externalId);
  const { token } = await pageTokenFor(ws.id, ev.pageId);
  return getMessengerProfile(token || getSettings(ws).facebook?.pageToken, ev.externalId);
}

const GENERIC_NAME = /^Khách (Zalo|Messenger|bình luận)$/;
const mergePhones = (cur: string, add: string[]) => [...new Set([...cur.split(",").filter(Boolean), ...add])].slice(0, 10).join(",");

/**
 * Ghi các tin nhận từ webhook: tạo/cập nhật hội thoại, chống trùng theo mã tin, tạo/gộp khách từ SĐT trong chat,
 * chia người phụ trách, chạy hành động tự động của trang/bài viết, báo người phụ trách.
 */
export async function ingestEvents(ws: Workspace, events: InboxEvent[], payload: unknown): Promise<IngestResult[]> {
  const out: IngestResult[] = [];
  for (const ev of events) {
    if (ev.post) {
      await upsertPostEvent(ws.id, ev.pageId ?? "", ev.post);
      continue;
    }
    if (ev.kind === "comment" && ev.comment) {
      const r = await ingestComment(ws, ev, payload);
      if (r) out.push(r);
      continue;
    }
    if (!ev.externalId) continue;
    const key = { workspaceId_channel_externalId: { workspaceId: ws.id, channel: ev.channel, externalId: ev.externalId } };
    let conv = await db.conversation.findUnique({ where: key });
    if (conv && ev.msgId && (await db.message.findFirst({ where: { conversationId: conv.id, externalId: ev.msgId }, select: { id: true } }))) {
      out.push({ conversationId: conv.id, status: "duplicate", recordId: conv.recordId });
      continue;
    }
    const page = ev.channel === "messenger" ? await findPage(ws.id, ev.pageId) : null;
    if (page && !page.active) {
      out.push({ conversationId: conv?.id ?? "", status: "ignored" });
      continue;
    }
    const at = ev.at && !isNaN(ev.at.getTime()) ? ev.at : new Date();
    const atts = ev.attachments ?? [];
    const prevUnread = conv?.unread ?? 0;
    const inbound = ev.direction === "in";
    const src = ev.referral ? { source: ev.referral.source, sourceRef: ev.referral.adId || ev.referral.ref || ev.referral.postId || "" } : {};

    if (!conv || (!conv.name && inbound)) {
      const prof = inbound ? await profileOf(ws, ev) : null;
      const fallback = ev.channel === "zalo" ? "Khách Zalo" : "Khách Messenger";
      if (!conv) {
        // upsert phòng hai webhook đến cùng lúc cho cùng một khách.
        conv = await db.conversation.upsert({
          where: key,
          create: { workspaceId: ws.id, channel: ev.channel, externalId: ev.externalId, pageId: ev.pageId ?? "", name: prof?.name || ev.name || "", avatar: prof?.avatar ?? "", lastAt: at, ...src },
          update: {},
        });
        if (!conv.name) conv = await db.conversation.update({ where: { id: conv.id }, data: { name: fallback } });
      } else if (prof?.name) conv = await db.conversation.update({ where: { id: conv.id }, data: { name: prof.name, avatar: prof.avatar } });
    }

    // Mở chat từ link m.me / quảng cáo mà chưa nhắn gì: chỉ ghi nguồn, không tạo tin.
    if (ev.system && ev.referral && !ev.text && !atts.length) {
      conv = await db.conversation.update({ where: { id: conv.id }, data: src });
      out.push({ conversationId: conv.id, status: "updated", recordId: conv.recordId });
      continue;
    }

    await db.message.create({
      data: {
        conversationId: conv.id,
        direction: ev.direction,
        text: ev.text.slice(0, 5000),
        attachmentsJson: JSON.stringify(atts),
        externalId: ev.msgId ?? "",
        author: inbound ? conv.name : CHANNEL_LABEL[ev.channel],
        createdAt: at,
      },
    });
    const human = !ev.system;
    conv = await db.conversation.update({
      where: { id: conv.id },
      data: {
        lastText: (inbound ? "" : "Bạn: ") + preview(ev.text, atts),
        lastAt: at > conv.lastAt ? at : conv.lastAt,
        // Trang/OA đã trả lời ở nơi khác (Meta Business Suite, app Zalo OA) thì coi như đã đọc.
        ...(inbound ? { unread: { increment: 1 }, status: "open" } : { unread: 0 }),
        ...(inbound && human ? { lastInAt: at } : {}),
        ...(!inbound ? { lastOutAt: at, ...(!conv.firstReplyAt && conv.lastInAt ? { firstReplyAt: at } : {}) } : {}),
        ...(ev.pageId && !conv.pageId ? { pageId: ev.pageId } : {}),
        ...src,
      },
    });

    if (inbound) conv = await afterInbound(ws, conv, ev, payload, { notifyFirst: prevUnread === 0, label: CHANNEL_LABEL[ev.channel] });
    out.push({ conversationId: conv.id, status: "created", recordId: conv.recordId });
  }
  return out;
}

/**
 * Sau mỗi tin / bình luận của khách: cập nhật SĐT phát hiện được, tạo hoặc cập nhật khách (Pref "inboxCrm"),
 * chia người phụ trách, dừng chuỗi chăm sóc, chạy tự động "message_received", báo người phụ trách.
 */
async function afterInbound(ws: Workspace, conv: Conversation, ev: InboxEvent, payload: unknown, opts: { notifyFirst: boolean; label: string; silent?: boolean }): Promise<Conversation> {
  const det = detectContact(ev.text);
  const known = new Set(conv.phones.split(",").filter(Boolean));
  const newPhones = det.phones.filter((p) => !known.has(p));
  if (newPhones.length) conv = await db.conversation.update({ where: { id: conv.id }, data: { phones: mergePhones(conv.phones, newPhones) } });

  // Khách vừa được tạo/gắn từ chính tin này: không dừng ngay chuỗi chăm sóc vừa bắt đầu.
  let linkedNow = false;
  // Sự kiện hệ thống có lead (quan tâm Zalo OA) vẫn tạo khách như trước.
  if (!ev.system || ev.lead) {
    const pref = await inboxCrmPref(ws.id);
    const via = ev.kind === "comment" ? "bình luận Facebook" : `chat ${opts.label}`;
    if (!conv.recordId && pref.autoCreateContact) {
      const recordId = await linkOrCreateContact(ws, conv, ev, det, payload);
      if (recordId) {
        conv = await db.conversation.update({ where: { id: conv.id }, data: { recordId } });
        linkedNow = true;
      }
    } else if (conv.recordId && newPhones.length && pref.autoUpdatePhone) await savePhone(conv.recordId, newPhones[0]);
    if (conv.recordId) {
      if (newPhones.length)
        await db.activity.create({ data: { recordId: conv.recordId, kind: "system", body: `Khách để lại SĐT ${newPhones.join(", ")} trong ${via}${ev.text ? `: “${ev.text.slice(0, 300)}”` : ""}`, author: opts.label } }).catch(() => {});
      if (det.address && pref.autoAddress) await saveAddress(conv.recordId, det.address, via).catch(() => {});
    }
  }

  // Chia người phụ trách (hợp đồng của nhóm Chia hội thoại). Lỗi không chặn nhận tin.
  if (!ev.system) {
    const who = await assignOnIngest(ws.id, conv).catch(() => "");
    if (who && who !== conv.assignee) conv = await db.conversation.update({ where: { id: conv.id }, data: { assignee: who } });
    // Cảm xúc: luật tiếng Việt chạy ngay để khách bực được báo liền (job 5 phút vẫn chạy thêm Claude nếu có khoá).
    if (ev.text.trim() && conv.sentiment !== "negative") {
      const label = await analyzeIncoming(ws.id, conv.id, ev.text, { useAi: false });
      if (label !== "neutral" && label !== conv.sentiment && (label === "negative" || !conv.sentiment)) conv = { ...conv, sentiment: label };
    }
  }

  if (!ev.system) {
    if (conv.recordId) {
      if (!linkedNow) await stopEnrollmentsForRecord(ws.id, conv.recordId, "Khách đã trả lời").catch(() => {});
      const [rec, cfg] = await Promise.all([db.record.findUnique({ where: { id: conv.recordId } }), loadConfig(ws.id)]);
      if (rec && cfg) await fireEvent(ws.id, cfg, { kind: "message_received", record: rec, channel: ev.channel, text: ev.text }).catch(() => {});
    }
    // Chỉ báo ở tin đầu của một đợt chưa đọc để không dội thông báo.
    if (opts.notifyFirst && !opts.silent) {
      let owner = conv.assignee;
      if (!owner && conv.recordId) owner = (await db.record.findUnique({ where: { id: conv.recordId }, select: { ownerName: true } }))?.ownerName ?? "";
      const userId = await userIdByName(ws.id, owner);
      const verb = ev.kind === "comment" ? "bình luận" : `nhắn ${opts.label}`;
      await notify(ws.id, { userId, kind: "inbox", text: `${conv.name} ${verb}: ${preview(ev.text, ev.attachments)}`, href: `/w/inbox?c=${conv.id}` });
    }
  }
  return conv;
}

/** Gắn hội thoại với khách: trùng SĐT với khách cũ thì gắn khách đó, chưa có thì tạo lead (Hub nguồn khách). */
async function linkOrCreateContact(ws: Workspace, conv: Conversation, ev: InboxEvent, det: Detected, payload: unknown): Promise<string | null> {
  const phone = det.phones[0] ?? (ev.lead?.phone ? normPhone(ev.lead.phone) : "");
  const name = conv.name && !GENERIC_NAME.test(conv.name) ? conv.name : "";
  if (phone) {
    const dup = (await findDuplicatesFor(ws.id, { phone, email: det.emails[0], name }).catch(() => []))[0];
    if (dup) {
      await db.activity.create({ data: { recordId: dup.id, kind: "system", body: `Khách quay lại qua ${ev.kind === "comment" ? "bình luận Facebook" : CHANNEL_LABEL[ev.channel]} (${dup.reason.toLowerCase()}).`, author: CHANNEL_LABEL[ev.channel] } }).catch(() => {});
      return dup.id;
    }
  }
  let lead = ev.lead;
  if (!lead && phone) {
    const isComment = ev.kind === "comment";
    const ref = ev.referral;
    lead = {
      provider: "facebook",
      providerLabel: isComment ? "Bình luận Facebook" : "Facebook Messenger",
      channel: ref?.source === "ad" ? "ads" : "organic",
      name: name || (isComment ? "Khách bình luận" : "Khách nhắn Messenger"),
      phone,
      email: det.emails[0],
      externalId: isComment ? `cmt:${ev.comment?.commentId}` : `msg:${ev.msgId ?? conv.id}`,
      campaign: ref?.adId ? `Quảng cáo ${ref.adId}` : ref?.source === "ref" && ref.ref ? `m.me ref=${ref.ref}` : undefined,
      note: `${isComment ? "Bình luận" : "Tin nhắn"}: ${ev.text}`,
    };
  } else if (lead && phone && !lead.phone) lead = { ...lead, phone };
  if (!lead) return null;
  if (name) lead = { ...lead, name };
  const r = await ingestLead(ws, lead, payload).catch(() => null);
  return r?.recordId ?? null;
}

/** Khách đã gắn hồ sơ nhắn số điện thoại: điền vào hồ sơ nếu còn trống. */
async function savePhone(recordId: string, raw: string) {
  const phone = normPhone(raw);
  const rec = await db.record.findUnique({ where: { id: recordId } });
  if (!phone || !rec) return;
  const cfg = await loadConfig(rec.workspaceId);
  const key = cfg && getObject(cfg, rec.objectKey)?.fields.find((f) => f.type === "phone")?.key;
  const d = parseJson<Record<string, string | number>>(rec.dataJson, {});
  if (!key || d[key]) return;
  await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...d, [key]: phone }) } });
}

/** Địa chỉ phát hiện trong chat: điền trường địa chỉ (nếu bảng Khách có) hoặc lưu _dia_chi; ghi hoạt động. */
async function saveAddress(recordId: string, address: string, via: string) {
  const rec = await db.record.findUnique({ where: { id: recordId } });
  if (!rec) return;
  const cfg = await loadConfig(rec.workspaceId);
  const fields = (cfg && getObject(cfg, rec.objectKey)?.fields) || [];
  const key = fields.find((f) => (f.type === "text" || f.type === "longtext") && /dia_chi|address/.test(f.key))?.key ?? "_dia_chi";
  const d = parseJson<Record<string, string | number>>(rec.dataJson, {});
  if (String(d[key] ?? "").trim() === address) return;
  if (!d[key]) await db.record.update({ where: { id: rec.id }, data: { dataJson: JSON.stringify({ ...d, [key]: address }) } });
  await db.activity.create({ data: { recordId: rec.id, kind: "system", body: `Khách để lại địa chỉ trong ${via}: ${address}`, author: "Hộp thư" } });
}

/* ───────────── Bình luận fanpage ───────────── */

/** Ghi bài viết từ webhook (bài mới của trang). */
async function upsertPostEvent(workspaceId: string, pageId: string, p: InboxPostEvent) {
  if (!p.postId) return;
  if (p.remove) {
    await db.fbPost.deleteMany({ where: { workspaceId, postId: p.postId } });
    return;
  }
  await db.fbPost.upsert({
    where: { workspaceId_postId: { workspaceId, postId: p.postId } },
    create: { workspaceId, pageId, postId: p.postId, kind: p.kind, live: p.live, message: p.message, permalink: p.permalink, image: p.image, postedAt: p.at ?? new Date() },
    update: { kind: p.kind, live: p.live, ...(p.message ? { message: p.message } : {}), ...(p.permalink ? { permalink: p.permalink } : {}), ...(p.image ? { image: p.image } : {}) },
  });
}

/** Bài viết của bình luận: chưa có thì tạo từ thông tin webhook gửi kèm (đồng bộ chi tiết sau ở trang Bài viết). */
async function ensurePost(workspaceId: string, pageId: string, c: InboxComment) {
  const key = { workspaceId_postId: { workspaceId, postId: c.postId } };
  const cur = await db.fbPost.findUnique({ where: key });
  if (cur) return cur;
  return db.fbPost.upsert({
    where: key,
    create: { workspaceId, pageId, postId: c.postId, kind: c.post?.kind ?? "post", live: !!c.post?.live, message: c.post?.message ?? "", permalink: c.post?.permalink ?? "", image: c.post?.image ?? "" },
    update: {},
  });
}

async function findCommentMessage(workspaceId: string, commentId: string) {
  if (!commentId) return null;
  return db.message.findFirst({ where: { commentId, conversation: { workspaceId } }, include: { conversation: true } });
}

/** Một sự kiện bình luận: thêm / sửa / xoá / ẩn / hiện; trang trả lời; chạy tự ẩn, tự thích, tự trả lời. */
async function ingestComment(ws: Workspace, ev: InboxEvent, payload: unknown): Promise<IngestResult | null> {
  const c = ev.comment!;
  const pageId = ev.pageId ?? "";
  const at = ev.at && !isNaN(ev.at.getTime()) ? ev.at : new Date();
  const page = await findPage(ws.id, pageId);
  if (page && !page.active) return { conversationId: "", status: "ignored" };

  if (c.verb !== "add") {
    const m = await findCommentMessage(ws.id, c.commentId);
    if (!m) return null;
    const data =
      c.verb === "edited" ? { text: ev.text.slice(0, 5000) } : c.verb === "remove" ? { status: "removed" } : { hidden: c.verb === "hide" };
    await db.message.update({ where: { id: m.id }, data });
    return { conversationId: m.conversationId, status: "updated", recordId: m.conversation.recordId };
  }

  // Chống trùng: Facebook gửi lại, hoặc trả lời do chính CRM gửi (đã lưu commentId khi gọi API).
  const dupe = await findCommentMessage(ws.id, c.commentId);
  if (dupe) return { conversationId: dupe.conversationId, status: "duplicate", recordId: dupe.conversation.recordId };

  const post = await ensurePost(ws.id, pageId, c);
  const eff = effectiveSettings(pageSettings(page), postSettings(post));

  if (c.fromPage) {
    // Trang trả lời bình luận của khách (từ Facebook / Meta Business Suite): gắn vào hội thoại của bình luận cha.
    const parent = await findCommentMessage(ws.id, c.parentId);
    if (!parent) return null;
    const conv = parent.conversation;
    await db.message.create({ data: { conversationId: conv.id, direction: "out", kind: "comment", text: ev.text.slice(0, 5000), commentId: c.commentId, parentId: c.parentId, externalId: c.commentId, author: page?.name || "Trang", createdAt: at } });
    await db.conversation.update({
      where: { id: conv.id },
      data: { lastText: `Bạn: ${preview(ev.text, ev.attachments)}`, lastAt: at > conv.lastAt ? at : conv.lastAt, lastOutAt: at, unread: 0, ...(!conv.firstReplyAt && conv.lastInAt ? { firstReplyAt: at } : {}) },
    });
    return { conversationId: conv.id, status: "created", recordId: conv.recordId };
  }

  if (eff.skip) return { conversationId: "", status: "ignored" };

  const externalId = ev.externalId || `c:${c.postId}:${c.senderId}`;
  const key = { workspaceId_channel_externalId: { workspaceId: ws.id, channel: ev.channel, externalId } };
  let conv = await db.conversation.findUnique({ where: key });
  const isNew = !conv;
  const prevUnread = conv?.unread ?? 0;
  if (!conv)
    conv = await db.conversation.upsert({
      where: key,
      create: { workspaceId: ws.id, channel: ev.channel, externalId, pageId, kind: "comment", postId: c.postId, name: ev.name || "Khách bình luận", source: ev.referral?.source ?? "post", sourceRef: ev.referral?.adId || c.postId, lastAt: at },
      update: {},
    });
  else if (ev.name && GENERIC_NAME.test(conv.name)) conv = await db.conversation.update({ where: { id: conv.id }, data: { name: ev.name } });

  const msg = await db.message.create({
    data: {
      conversationId: conv.id,
      direction: "in",
      kind: "comment",
      text: ev.text.slice(0, 5000),
      attachmentsJson: JSON.stringify(ev.attachments ?? []),
      commentId: c.commentId,
      parentId: c.parentId && c.parentId !== c.postId ? c.parentId : "",
      externalId: c.commentId,
      author: conv.name,
      createdAt: at,
    },
  });
  conv = await db.conversation.update({
    where: { id: conv.id },
    data: {
      lastText: preview(ev.text, ev.attachments),
      lastAt: at > conv.lastAt ? at : conv.lastAt,
      lastInAt: at,
      status: "open",
      ...(eff.autoMarkRead ? { unread: 0, readAt: at } : { unread: { increment: 1 } }),
    },
  });

  const det = detectContact(ev.text);
  await db.fbPost.update({ where: { id: post.id }, data: { commentsCount: { increment: 1 }, ...(det.phones.length ? { phonesCount: { increment: 1 } } : {}) } });

  conv = await afterInbound(ws, conv, ev, payload, { notifyFirst: prevUnread === 0, label: "Facebook", silent: eff.autoMarkRead });

  // Hành động tự động của trang / bài viết. Không có token hoặc lỗi Facebook: bỏ qua, chỉ báo log một lần.
  const hasPhone = det.phones.length > 0;
  const auto = { actor: "Tự động", auto: true, messageId: msg.id };
  if (eff.autoHideAll || (eff.autoHidePhone && hasPhone)) await commentAction(conv, "hide", auto);
  if (eff.autoLike) await commentAction(conv, "like", auto);
  const vars = { name: conv.name, page: page?.name };
  if (isNew && eff.replyComment && (!eff.replyOnlyPhone || hasPhone)) await commentAction(conv, "reply", { ...auto, text: fillTemplate(eff.replyComment, vars) });
  if (!conv.privateReplied && eff.replyInbox && (!eff.replyOnlyPhone || hasPhone)) {
    const fresh = await db.conversation.findUnique({ where: { id: conv.id } });
    if (fresh) await commentAction(fresh, "private_reply", { ...auto, text: fillTemplate(eff.replyInbox, vars) });
  }
  return { conversationId: conv.id, status: "created", recordId: conv.recordId };
}

/** Sau khi Hub nguồn khách tạo lead có Zalo user id (ví dụ khách gửi form thông tin), gắn vào hội thoại Zalo chưa có khách. */
export async function linkLeadToConversation(workspaceId: string, zaloUid: string | undefined, recordId: string | undefined) {
  if (!zaloUid || !recordId) return;
  await db.conversation.updateMany({ where: { workspaceId, channel: "zalo", externalId: zaloUid, recordId: null }, data: { recordId } });
}

/* ───────────────────────────── Quyền xem ───────────────────────────── */

type Ctx = { user: { id: string; name: string }; workspace: { id: string; settingsJson: string } };

/**
 * Điều kiện lọc hội thoại theo quyền. Nhân viên bị giới hạn chỉ thấy hội thoại giao cho mình,
 * hoặc chưa giao ai mà khách gắn kèm (nếu có) là của mình / chưa ai nhận.
 */
export async function conversationScope(ctx: Ctx): Promise<Prisma.ConversationWhereInput> {
  const base: Prisma.ConversationWhereInput = { workspaceId: ctx.workspace.id };
  const rs = await recordScope(ctx);
  if (!rs.OR) return base;
  const hidden = await db.record.findMany({ where: { workspaceId: ctx.workspace.id, NOT: { ownerName: { in: [ctx.user.name, ""] } } }, select: { id: true } });
  return {
    ...base,
    OR: [{ assignee: ctx.user.name }, { assignee: "", OR: [{ recordId: null }, { recordId: { notIn: hidden.map((h) => h.id) } }] }],
  };
}

/** Mở một hội thoại nếu người dùng được phép thấy (theo conversationWhere của nhóm Chia hội thoại). */
export async function findConversation(ctx: Ctx, id: string) {
  return db.conversation.findFirst({ where: { AND: [{ id }, await conversationWhere(ctx)] } });
}

/* ───────────────────────────── DTO ───────────────────────────── */

export type ConversationDTO = {
  id: string;
  channel: InboxChannel;
  name: string;
  avatar: string;
  lastText: string;
  lastAt: string;
  unread: number;
  assignee: string;
  status: string;
  recordId: string | null;
  recordTitle: string;
};

export function toConversationDTO(c: Conversation, titles: Map<string, string>): ConversationDTO {
  return {
    id: c.id,
    channel: c.channel as InboxChannel,
    name: c.name || "Khách",
    avatar: c.avatar,
    lastText: c.lastText,
    lastAt: c.lastAt.toISOString(),
    unread: c.unread,
    assignee: c.assignee,
    status: c.status,
    recordId: c.recordId,
    recordTitle: (c.recordId && titles.get(c.recordId)) || "",
  };
}

export async function recordTitles(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await db.record.findMany({ where: { id: { in: list } }, select: { id: true, title: true } });
  return new Map(rows.map((r) => [r.id, r.title]));
}

export type Filter = "all" | "unread" | "mine" | "done";

/** Danh sách hội thoại theo bộ lọc, kèm số đếm cho các tab. */
export async function listConversations(ctx: Ctx, opts: { filter?: string; channel?: string; q?: string }) {
  const scope = await conversationScope(ctx);
  const and: Prisma.ConversationWhereInput[] = [scope];
  if (opts.channel === "zalo" || opts.channel === "messenger") and.push({ channel: opts.channel });
  const q = opts.q?.trim();
  if (q) and.push({ OR: [{ name: { contains: q } }, { lastText: { contains: q } }, { messages: { some: { text: { contains: q } } } }] });
  const f = opts.filter as Filter;
  const byFilter: Record<Filter, Prisma.ConversationWhereInput> = {
    all: { status: { not: "done" } },
    unread: { unread: { gt: 0 } },
    mine: { assignee: ctx.user.name, status: { not: "done" } },
    done: { status: "done" },
  };
  const rows = await db.conversation.findMany({ where: { AND: [...and, byFilter[f] ?? byFilter.all] }, orderBy: { lastAt: "desc" }, take: 200 });
  const [all, unread, mine, done, unreadTotal] = await Promise.all([
    db.conversation.count({ where: { AND: [scope, byFilter.all] } }),
    db.conversation.count({ where: { AND: [scope, byFilter.unread] } }),
    db.conversation.count({ where: { AND: [scope, byFilter.mine] } }),
    db.conversation.count({ where: { AND: [scope, byFilter.done] } }),
    db.conversation.aggregate({ where: scope, _sum: { unread: true } }),
  ]);
  const titles = await recordTitles(rows.map((r) => r.recordId));
  return { items: rows.map((r) => toConversationDTO(r, titles)), counts: { all, unread, mine, done }, unreadTotal: unreadTotal._sum.unread ?? 0 };
}

export type MessageDTO = { id: string; direction: "in" | "out" | "note"; text: string; attachments: Attachment[]; author: string; status: string; error: string; at: string };
export type RecordCard = { id: string; title: string; phone: string; score: number; status: string; statusColor: string; source: string; owner: string };

/** Chi tiết một hội thoại: tin nhắn, thẻ khách, 5 hoạt động gần nhất. */
export async function conversationDetail(conv: Conversation, cfg: WorkspaceConfig) {
  const msgs = await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 300 });
  const rec = conv.recordId ? await db.record.findUnique({ where: { id: conv.recordId }, include: { activities: { orderBy: { createdAt: "desc" }, take: 5 } } }) : null;
  let card: RecordCard | null = null;
  if (rec) {
    const obj = getObject(cfg, rec.objectKey);
    const d = parseJson<Record<string, string | number>>(rec.dataJson, {});
    const phoneKey = obj?.fields.find((f) => f.type === "phone")?.key;
    const st = obj?.statuses.find((s) => s.key === rec.status);
    card = {
      id: rec.id,
      title: rec.title,
      phone: phoneKey ? String(d[phoneKey] ?? "") : "",
      score: rec.score,
      status: st?.label ?? rec.status,
      statusColor: st?.color ?? "gray",
      source: String(d._nguon || d.nguon || ""),
      owner: rec.ownerName,
    };
  }
  const titles = await recordTitles([conv.recordId]);
  return {
    conversation: toConversationDTO(conv, titles),
    messages: msgs.reverse().map<MessageDTO>((m) => ({
      id: m.id,
      direction: m.direction as MessageDTO["direction"],
      text: m.text,
      attachments: parseJson<Attachment[]>(m.attachmentsJson, []),
      author: m.author,
      status: m.status,
      error: m.error,
      at: m.createdAt.toISOString(),
    })),
    record: card,
    activities: (rec?.activities ?? []).map((a) => ({ id: a.id, kind: a.kind, body: a.body, author: a.author, at: a.createdAt.toISOString() })),
  };
}

/* ───────────────────────────── Gửi tin ───────────────────────────── */

/**
 * Gửi tin trả lời qua đúng kênh, lưu Message (sent/failed) và ghi hoạt động vào hồ sơ khách.
 * Hội thoại bình luận: trả lời công khai dưới bình luận gần nhất của khách.
 * Messenger: tự thêm chữ ký của trang (withSignature, không thêm lần hai nếu đã có).
 */
export async function sendReply(ctx: Ctx, conv: Conversation, text: string, opts: { humanAgent?: boolean } = {}) {
  if (conv.kind === "comment") {
    const r = await commentAction(conv, "reply", { text, actor: ctx.user.name });
    const id = r.message?.id;
    if (r.ok) {
      if (!conv.assignee) await db.conversation.update({ where: { id: conv.id }, data: { assignee: ctx.user.name } });
      if (conv.recordId) await db.activity.create({ data: { recordId: conv.recordId, kind: "update", body: `Đã trả lời bình luận Facebook: ${text}`, author: ctx.user.name } }).catch(() => {});
    }
    const error = r.ok ? "" : r.error;
    // commentAction đã lưu tin (sent hoặc failed); thiếu (vd. không tìm thấy bình luận) thì lưu tin lỗi để nhân viên thấy.
    const msg = (id && (await db.message.findUnique({ where: { id } }))) || (await db.message.create({ data: { conversationId: conv.id, direction: "out", kind: "comment", text, author: ctx.user.name, status: "failed", error } }));
    return { message: msg, error, windowClosed: false };
  }
  let externalId = "";
  let error = "";
  let windowClosed = false;
  if (conv.channel === "messenger") {
    const page = conv.pageId ? await findPage(ctx.workspace.id, conv.pageId) : null;
    let sig = pageSettings(page).signature.trim();
    if (!sig) sig = (await inboxCrmPref(ctx.workspace.id)).signature.trim().slice(0, 150);
    text = appendSignature(text, sig);
  }
  try {
    externalId =
      conv.channel === "zalo" ? await sendZaloText(ctx.workspace.id, conv.externalId, text) : await sendMessengerText(ctx.workspace.id, conv.externalId, text, { ...opts, pageId: conv.pageId || undefined });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    windowClosed = e instanceof MessengerError && e.windowClosed;
  }
  const msg = await db.message.create({
    data: { conversationId: conv.id, direction: "out", text, externalId, author: ctx.user.name, status: error ? "failed" : "sent", error },
  });
  if (!error) {
    await db.conversation.update({
      where: { id: conv.id },
      data: { lastText: `Bạn: ${preview(text)}`, lastAt: msg.createdAt, lastOutAt: msg.createdAt, ...(!conv.firstReplyAt && conv.lastInAt ? { firstReplyAt: msg.createdAt } : {}), unread: 0, assignee: conv.assignee || ctx.user.name },
    });
    if (conv.recordId)
      await db.activity.create({ data: { recordId: conv.recordId, kind: "update", body: `Đã nhắn ${CHANNEL_LABEL[conv.channel as InboxChannel] ?? conv.channel}: ${text}`, author: ctx.user.name } }).catch(() => {});
  }
  return { message: msg, error, windowClosed };
}

/** Ghi chú nội bộ: chỉ đội ngũ thấy, không gửi cho khách. */
export async function addNote(ctx: Ctx, conv: Conversation, text: string) {
  const msg = await db.message.create({ data: { conversationId: conv.id, direction: "note", text, author: ctx.user.name } });
  if (conv.recordId) await db.activity.create({ data: { recordId: conv.recordId, kind: "update", body: `Ghi chú hội thoại: ${text}`, author: ctx.user.name } }).catch(() => {});
  return msg;
}

/* ───────────────────────────── AI soạn trả lời ───────────────────────────── */

type Intent = "price" | "address" | "booking" | "promo" | "thanks" | "greeting";
export const INTENT_LABEL: Record<Intent, string> = { price: "Hỏi giá", address: "Hỏi địa chỉ", booking: "Đặt lịch", promo: "Hỏi khuyến mãi", thanks: "Cảm ơn", greeting: "Chào hỏi" };

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

/** Nhận diện ý định bằng từ khoá (bỏ dấu để bắt cả kiểu gõ không dấu). */
export function detectIntent(text: string): Intent {
  const t = ` ${strip(text)} `;
  if (/khuyen mai|uu dai|giam gia|\bsale\b|\bkm\b|voucher|ma giam/.test(t)) return "promo";
  if (/\bgia\b|bao nhieu|\bbn\b|chi phi|\bphi\b|bao gia|may tien|nhieu tien|hoc phi/.test(t)) return "price";
  if (/dia chi|o dau|cho nao|chi nhanh|duong nao|ban do|\bmap\b|co so/.test(t)) return "address";
  if (/dat lich|hen |lich |\bbook|may gio|gio nao|dat ban|xem nha|lai thu|hoc thu|tham quan|khi nao|ngay mai|cuoi tuan|thu [2-7]/.test(t)) return "booking";
  if (/cam on|thank|\btks\b|\bok\b|oke|duoc roi|\bthanks\b/.test(t)) return "thanks";
  return "greeting";
}

const TOPIC: Record<string, { item: string; book: string }> = {
  spa: { item: "liệu trình chăm sóc da", book: "đặt lịch trải nghiệm" },
  bds: { item: "căn hộ", book: "hẹn đi xem nhà mẫu" },
  edu: { item: "khoá học", book: "đăng ký học thử" },
  retail: { item: "sản phẩm", book: "giữ hàng" },
  b2b: { item: "gói dịch vụ", book: "hẹn buổi trao đổi" },
  dental: { item: "dịch vụ nha khoa", book: "đặt lịch khám" },
  fnb: { item: "thực đơn", book: "đặt bàn" },
  auto: { item: "mẫu xe", book: "đăng ký lái thử" },
  insurance: { item: "gói bảo hiểm", book: "hẹn tư vấn" },
  interior: { item: "gói thiết kế thi công", book: "hẹn khảo sát" },
};
const topicOf = (cfg: WorkspaceConfig) => TOPIC[cfg.industry] ?? { item: "dịch vụ", book: "đặt lịch" };

/** Tên gọi thân mật: lấy chữ cuối của họ tên ("Nguyễn Thị Lan" → "Lan"). */
const given = (name: string) => (/^Khách/.test(name) ? "" : name.trim().split(/\s+/).pop() ?? "");

/** Mẫu trả lời theo ý định khi chưa có AI. */
export function ruleDraft(lastIn: string, name: string, cfg: WorkspaceConfig) {
  const intent = detectIntent(lastIn);
  const you = given(name) ? `anh/chị ${given(name)}` : "anh/chị";
  const biz = cfg.businessName;
  const { item, book } = topicOf(cfg);
  const T: Record<Intent, string> = {
    price: `Dạ ${biz} chào ${you} ạ. Chi phí ${item} bên em tuỳ theo nhu cầu cụ thể, hiện đang có nhiều gói phù hợp. ${you[0].toUpperCase() + you.slice(1)} cho em xin số điện thoại để em gửi bảng giá chi tiết và tư vấn gói tiết kiệm nhất nhé ạ?`,
    address: `Dạ ${biz} ở địa chỉ [điền địa chỉ] ạ. Em gửi ${you} bản đồ: [link Google Maps]. ${you[0].toUpperCase() + you.slice(1)} định ghé lúc nào để em sắp xếp người đón tiếp chu đáo ạ?`,
    booking: `Dạ em cảm ơn ${you} đã ${book} với ${biz} ạ. ${you[0].toUpperCase() + you.slice(1)} cho em xin ngày giờ thuận tiện và số điện thoại, em xác nhận lịch ngay và nhắc ${you} trước 1 tiếng nhé ạ.`,
    promo: `Dạ tháng này ${biz} đang có ưu đãi cho khách mới khi ${book} ạ. Em gửi ${you} chi tiết chương trình nhé, ${you} quan tâm ${item} nào để em áp ưu đãi phù hợp nhất ạ?`,
    thanks: `Dạ ${biz} cảm ơn ${you} nhiều ạ. Nếu cần hỗ trợ thêm, ${you} cứ nhắn em bất cứ lúc nào nhé. Chúc ${you} một ngày thật vui!`,
    greeting: `Dạ ${biz} xin chào ${you} ạ. Em có thể hỗ trợ gì cho ${you} về ${item} ạ?`,
  };
  return { text: T[intent], intent, intentLabel: INTENT_LABEL[intent] };
}

const DraftOut = z.object({ reply: z.string(), intent: z.enum(["price", "address", "booking", "promo", "thanks", "greeting"]) });

/** Claude soạn trả lời dựa trên lịch sử hội thoại + thông tin khách + DNA. Không có AI hoặc lỗi thì dùng mẫu theo ý định. */
export async function draftReply(conv: Conversation, cfg: WorkspaceConfig) {
  const msgs = (await db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, take: 20 })).reverse();
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in")?.text ?? "";
  const fallback = { ...ruleDraft(lastIn, conv.name, cfg), source: "rule" as const };
  const c = ai();
  if (!c) return fallback;
  try {
    const [dnaRow, rec] = await Promise.all([
      db.dna.findFirst({ where: { workspaceId: conv.workspaceId }, orderBy: { createdAt: "desc" } }),
      conv.recordId ? db.record.findUnique({ where: { id: conv.recordId }, include: { activities: { orderBy: { createdAt: "desc" }, take: 5 } } }) : null,
    ]);
    const dna = parseJson<{ products?: string; targetCustomer?: string; salesSteps?: string }>(dnaRow?.dataJson, {});
    const industry = INDUSTRIES[cfg.industry as keyof typeof INDUSTRIES]?.label ?? cfg.industry;
    const history = msgs
      .filter((m) => m.direction !== "note")
      .map((m) => `${m.direction === "in" ? "Khách" : "Shop"}: ${m.text || preview("", parseJson<Attachment[]>(m.attachmentsJson, []))}`)
      .join("\n");
    const notes = msgs.filter((m) => m.direction === "note").map((m) => `- ${m.text}`).join("\n");
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(DraftOut) },
      system: `Bạn là nhân viên chăm sóc khách hàng của ${cfg.businessName} (ngành ${industry}), trả lời tin nhắn ${CHANNEL_LABEL[conv.channel as InboxChannel] ?? ""}. Viết tiếng Việt lễ phép, thân thiện, xưng "em", gọi khách "anh/chị" kèm tên nếu biết; 1–3 câu ngắn như nhắn tin thật; không bịa giá hay địa chỉ cụ thể nếu không có trong dữ liệu (dùng chỗ trống dạng [điền giá]); luôn kết thúc bằng một câu hỏi hoặc lời mời hành động tiếp theo (xin SĐT, chốt lịch...).`,
      messages: [
        {
          role: "user",
          content: `SẢN PHẨM/DỊCH VỤ: ${dna.products || "(chưa có)"}
KHÁCH MỤC TIÊU: ${dna.targetCustomer || "(chưa có)"}
QUY TRÌNH BÁN: ${dna.salesSteps || "(chưa có)"}

KHÁCH: ${conv.name}${rec ? ` · trạng thái ${rec.status} · điểm ${rec.score}` : " · chưa có hồ sơ"}
${rec?.activities.length ? `HOẠT ĐỘNG GẦN ĐÂY:\n${rec.activities.map((a) => `- ${a.body.slice(0, 200)}`).join("\n")}\n` : ""}${notes ? `GHI CHÚ NỘI BỘ:\n${notes}\n` : ""}
LỊCH SỬ HỘI THOẠI:
${history || "(chưa có tin)"}

Soạn tin trả lời tiếp theo của shop.`,
        },
      ],
    });
    const o = res.parsed_output;
    if (res.stop_reason === "refusal" || !o?.reply.trim()) return fallback;
    return { text: o.reply.trim(), intent: o.intent, intentLabel: INTENT_LABEL[o.intent], source: "ai" as const };
  } catch (e) {
    console.error("[inbox draft]", e instanceof Error ? e.message : e);
    return fallback;
  }
}

/* ───────────────────────────── Dữ liệu mẫu ───────────────────────────── */

type SeedMsg = [dir: "in" | "out" | "note", text: string, minutesAgo: number];

/** 6 hội thoại mẫu (3 Zalo, 3 Messenger) gắn với khách mẫu: có tin chưa đọc, một hội thoại đã xong, một ghi chú nội bộ. */
export async function seedInbox(workspaceId: string, cfg: WorkspaceConfig): Promise<void> {
  if (await db.conversation.count({ where: { workspaceId } })) return;
  const contacts = await db.record.findMany({ where: { workspaceId, objectKey: "contacts" }, orderBy: { createdAt: "asc" }, take: 6 });
  const { item, book } = topicOf(cfg);
  const biz = cfg.businessName;
  const team = cfg.team;
  const H = 60;
  const D = 24 * H;
  const threads: { channel: InboxChannel; status?: string; assignee?: string; msgs: SeedMsg[] }[] = [
    {
      channel: "zalo",
      msgs: [
        ["in", `Chào shop, cho mình hỏi ${item} bên mình giá bao nhiêu vậy?`, 42],
        ["out", `Dạ ${biz} chào chị ạ. Chị đang quan tâm gói nào để em gửi bảng giá chi tiết ạ?`, 38],
        ["in", "Mình muốn gói cơ bản trước, có ưu đãi cho khách mới không shop?", 6],
        ["in", "Mình ở Cầu Giấy, cuối tuần qua được không?", 5],
      ],
    },
    {
      channel: "messenger",
      assignee: team[0],
      msgs: [
        ["in", `Mình thấy quảng cáo ${biz} trên Facebook, tháng này có khuyến mãi gì không ạ?`, 3 * H],
        ["out", `Dạ tháng này bên em giảm 20% cho khách mới khi ${book} trong tuần ạ.`, 3 * H - 10],
        ["note", "Khách hỏi kỹ về giá, có vẻ đang so sánh với bên khác. Ưu tiên gọi lại trong hôm nay.", 3 * H - 8],
        ["in", "Vậy cho mình đặt lịch chiều thứ 7 nhé, số mình 0912 345 678", 25],
      ],
    },
    {
      channel: "zalo",
      assignee: team[1] ?? team[0],
      msgs: [
        ["in", `Em muốn ${book} vào sáng mai được không ạ?`, 2 * D],
        ["out", "Dạ được ạ, em giữ lịch 9h sáng mai cho mình nhé. Em sẽ nhắn nhắc trước 1 tiếng ạ.", 2 * D - 15],
        ["in", "Ok cảm ơn shop nhiều!", 2 * D - 12],
      ],
      status: "done",
    },
    {
      channel: "messenger",
      msgs: [
        ["in", "Shop ơi địa chỉ ở đâu vậy, có chỗ gửi xe ô tô không?", 70],
      ],
    },
    {
      channel: "zalo",
      assignee: team[0],
      msgs: [
        ["out", `Dạ ${biz} gửi anh thông tin ${item} như anh hỏi hôm qua ạ.`, D + 3 * H],
        ["in", "Cảm ơn em, để anh bàn với vợ rồi báo lại nhé.", D + 2 * H],
        ["out", "Dạ vâng ạ, anh cần thêm thông tin gì cứ nhắn em nhé.", D + 2 * H - 5],
      ],
    },
    {
      channel: "messenger",
      msgs: [
        ["in", `Cho mình xin bảng giá ${item} với ạ`, 12],
        ["in", "Có trả góp không shop?", 11],
      ],
    },
  ];
  const now = Date.now();
  for (const [i, t] of threads.entries()) {
    const rec = contacts[i];
    const name = rec?.title ?? ["Nguyễn Thị Lan", "Trần Minh Khoa", "Lê Thu Hà", "Phạm Quốc Bảo", "Hoàng Ngọc Mai", "Vũ Đức Anh"][i];
    const at = (m: number) => new Date(now - m * 60e3);
    const msgs = t.msgs;
    const last = [...msgs].reverse().find((m) => m[0] !== "note")!;
    // Tin chưa đọc = các tin khách gửi sau tin trả lời cuối của shop (trừ hội thoại đã xong).
    let unread = 0;
    if (t.status !== "done") for (let k = msgs.length - 1; k >= 0 && msgs[k][0] !== "out"; k--) if (msgs[k][0] === "in") unread++;
    await db.conversation.create({
      data: {
        workspaceId,
        channel: t.channel,
        externalId: `mau-${t.channel}-${i + 1}`,
        pageId: t.channel === "messenger" ? "mau-page" : "",
        recordId: rec?.id ?? null,
        name,
        lastText: (last[0] === "out" ? "Bạn: " : "") + last[1],
        lastAt: at(last[2]),
        unread,
        assignee: t.assignee ?? "",
        status: t.status ?? "open",
        createdAt: at(msgs[0][2]),
        messages: {
          create: msgs.map(([direction, text, m], k) => ({
            direction,
            text,
            author: direction === "in" ? name : direction === "note" ? (t.assignee ?? team[0] ?? "Quản lý") : (t.assignee ?? team[0] ?? biz),
            externalId: direction === "note" ? "" : `mau-${t.channel}-${i + 1}-${k}`,
            createdAt: at(m),
          })),
        },
      },
    });
  }
}
