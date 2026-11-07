// Thao tác trên bình luận fanpage: trả lời công khai, nhắn riêng, ẩn/hiện, thích, xoá, đánh dấu tạo đơn.
// Dùng chung cho API /api/inbox/[id]/comment và hành động tự động khi nhận bình luận.
import type { Conversation, Message } from "@prisma/client";
import { db } from "../db";
import { deleteComment, FbError, isDryRun, likeComment, privateReply, replyComment, setCommentHidden } from "./graph";
import { appendSignature, inboxCrmPref, pageSettings, pageTokenFor } from "./pages";

export const COMMENT_ACTIONS = ["reply", "private_reply", "hide", "unhide", "like", "delete", "mark_order"] as const;
export type CommentAction = (typeof COMMENT_ACTIONS)[number];

/** Định dạng Message trả cho giao diện. */
export type CommentMessageDTO = {
  id: string;
  direction: string;
  kind: string;
  text: string;
  commentId: string;
  parentId: string;
  hidden: boolean;
  liked: boolean;
  status: string;
  error: string;
  author: string;
  at: string;
};
export const toCommentMessage = (m: Message): CommentMessageDTO => ({
  id: m.id,
  direction: m.direction,
  kind: m.kind,
  text: m.text,
  commentId: m.commentId,
  parentId: m.parentId,
  hidden: m.hidden,
  liked: m.liked,
  status: m.status,
  error: m.error,
  author: m.author,
  at: m.createdAt.toISOString(),
});

export type ConversationPatch = Pick<Conversation, "id" | "orderMarked" | "privateReplied" | "lastText" | "unread" | "kind" | "postId"> & { lastOutAt: string | null; firstReplyAt: string | null };
const convPatch = (c: Conversation): ConversationPatch => ({
  id: c.id,
  kind: c.kind,
  postId: c.postId,
  orderMarked: c.orderMarked,
  privateReplied: c.privateReplied,
  lastText: c.lastText,
  unread: c.unread,
  lastOutAt: c.lastOutAt?.toISOString() ?? null,
  firstReplyAt: c.firstReplyAt?.toISOString() ?? null,
});

export type CommentActionResult =
  | {
      ok: true;
      action: CommentAction;
      message: CommentMessageDTO | null;
      /** Bình luận gốc sau khi đổi (ẩn/thích/xoá) — với reply/private_reply là bình luận được trả lời. */
      target: CommentMessageDTO | null;
      conversation: ConversationPatch;
      /** Hội thoại inbox của người bình luận (sau khi nhắn riêng, nếu Facebook trả PSID). */
      inboxConversationId?: string;
      simulated: boolean;
    }
  | { ok: false; status: number; error: string; message?: CommentMessageDTO | null };

// Báo lỗi tự động một lần cho mỗi trang + loại lỗi (không dội log). Không in token.
const g = globalThis as unknown as { fbWarned?: Set<string> };
export function warnOnce(key: string, msg: string) {
  const s = (g.fbWarned ??= new Set());
  if (s.has(key)) return;
  s.add(key);
  console.warn(`[fanpage] ${msg}`);
}

const preview = (t: string) => t.trim().slice(0, 200);

/** Bình luận đích: theo messageId, không có thì bình luận gần nhất của khách trong hội thoại. */
async function targetOf(conv: Conversation, messageId?: string) {
  if (messageId) return db.message.findFirst({ where: { id: messageId, conversationId: conv.id } });
  return db.message.findFirst({ where: { conversationId: conv.id, kind: "comment", direction: "in", status: { notIn: ["deleted", "removed"] } }, orderBy: { createdAt: "desc" } });
}

/** Cập nhật hội thoại sau tin gửi đi. Tin tự động không tính là "phản hồi đầu tiên" (không làm đẹp số liệu thời gian phản hồi). */
async function markOut(conv: Conversation, at: Date, text: string, auto = false) {
  return db.conversation.update({
    where: { id: conv.id },
    data: { lastText: `Bạn: ${preview(text)}`, lastAt: at > conv.lastAt ? at : conv.lastAt, lastOutAt: at, ...(auto ? {} : { unread: 0 }), ...(!auto && !conv.firstReplyAt && conv.lastInAt ? { firstReplyAt: at } : {}) },
  });
}

/**
 * Thực hiện một thao tác bình luận. actor = tên người thao tác (hoặc "Tự động").
 * Lỗi Facebook trả { ok: false, status: 502, error } kèm tin trả lời đã lưu ở trạng thái "failed" (nếu có).
 */
export async function commentAction(conv: Conversation, action: CommentAction, opts: { messageId?: string; text?: string; actor: string; auto?: boolean }): Promise<CommentActionResult> {
  const wid = conv.workspaceId;
  if (action === "mark_order") {
    const next = await db.conversation.update({ where: { id: conv.id }, data: { orderMarked: !conv.orderMarked } });
    return { ok: true, action, message: null, target: null, conversation: convPatch(next), simulated: false };
  }
  const target = await targetOf(conv, opts.messageId);
  if (!target) return { ok: false, status: 404, error: "Không tìm thấy bình luận trong hội thoại này" };
  if (!target.commentId) return { ok: false, status: 400, error: conv.channel === "instagram" ? "Tin này không phải bình luận Instagram" : "Tin này không phải bình luận Facebook" };
  if (target.status === "deleted" || target.status === "removed") return { ok: false, status: 409, error: "Bình luận đã bị xoá" };
  const { token, page } = await pageTokenFor(wid, conv.pageId);
  const simulated = isDryRun(token);
  // Trang Instagram (FbPage platform "instagram") hoặc hội thoại kênh instagram: dùng API bình luận Instagram.
  const platform = page?.platform === "instagram" || conv.channel === "instagram" ? "instagram" : "facebook";
  const text = (opts.text ?? "").trim();
  if ((action === "reply" || action === "private_reply") && !text) return { ok: false, status: 400, error: "Nhập nội dung trả lời" };
  if (!token) {
    warnOnce(`${wid}:${conv.pageId}:notoken`, `Trang ${conv.pageId || "(không rõ)"} chưa có token: bỏ qua thao tác bình luận.`);
    if (opts.auto) return { ok: false, status: 409, error: "Trang chưa có Page Access Token" };
  }

  try {
    switch (action) {
      case "reply": {
        const id = await replyComment(token, target.commentId, text, platform);
        const msg = await db.message.create({ data: { conversationId: conv.id, direction: "out", kind: "comment", text, commentId: id, parentId: target.commentId, externalId: id, author: opts.actor } });
        const next = await markOut(conv, msg.createdAt, text, opts.auto);
        return { ok: true, action, message: toCommentMessage(msg), target: toCommentMessage(target), conversation: convPatch(next), simulated };
      }
      case "private_reply": {
        // Facebook chỉ cho nhắn riêng một lần cho mỗi bình luận.
        const done = await db.message.findFirst({ where: { conversationId: conv.id, direction: "out", kind: "message", parentId: target.commentId, status: "sent" }, select: { id: true } });
        if (done) return { ok: false, status: 409, error: "Bình luận này đã được nhắn riêng. Facebook chỉ cho nhắn riêng một lần cho mỗi bình luận." };
        let sig = pageSettings(page).signature.trim();
        if (!sig) sig = (await inboxCrmPref(wid)).signature.trim().slice(0, 150);
        const body = appendSignature(text, sig);
        const r = await privateReply(token, target.commentId, body);
        let inboxConversationId: string | undefined;
        // Facebook trả PSID của người bình luận: tin nằm ở hội thoại inbox của họ (tạo nếu chưa có).
        if (r.recipientId) {
          const key = { workspaceId_channel_externalId: { workspaceId: wid, channel: conv.channel, externalId: r.recipientId } };
          const inbox = await db.conversation.upsert({
            where: key,
            create: { workspaceId: wid, channel: conv.channel, externalId: r.recipientId, pageId: conv.pageId, name: conv.name, avatar: conv.avatar, recordId: conv.recordId, assignee: conv.assignee || opts.actor, source: "post", sourceRef: conv.postId, phones: conv.phones, lastAt: new Date() },
            update: {},
          });
          const m2 = await db.message.create({ data: { conversationId: inbox.id, direction: "out", text: body, externalId: r.messageId, author: opts.actor } });
          await markOut(inbox, m2.createdAt, body, opts.auto);
          inboxConversationId = inbox.id;
        }
        const msg = await db.message.create({ data: { conversationId: conv.id, direction: "out", kind: "message", text: body, externalId: r.messageId, parentId: target.commentId, author: opts.actor } });
        await markOut(conv, msg.createdAt, `[Nhắn riêng] ${body}`, opts.auto);
        const next = await db.conversation.update({ where: { id: conv.id }, data: { privateReplied: true } });
        return { ok: true, action, message: toCommentMessage(msg), target: toCommentMessage(target), conversation: convPatch(next), inboxConversationId, simulated };
      }
      case "hide":
      case "unhide": {
        const hidden = action === "hide";
        await setCommentHidden(token, target.commentId, hidden, platform);
        const t = await db.message.update({ where: { id: target.id }, data: { hidden } });
        return { ok: true, action, message: null, target: toCommentMessage(t), conversation: convPatch(conv), simulated };
      }
      case "like": {
        const like = !target.liked;
        await likeComment(token, target.commentId, like, platform);
        const t = await db.message.update({ where: { id: target.id }, data: { liked: like } });
        return { ok: true, action, message: null, target: toCommentMessage(t), conversation: convPatch(conv), simulated };
      }
      case "delete": {
        await deleteComment(token, target.commentId);
        const t = await db.message.update({ where: { id: target.id }, data: { status: "deleted", hidden: true } });
        return { ok: true, action, message: null, target: toCommentMessage(t), conversation: convPatch(conv), simulated };
      }
    }
  } catch (e) {
    const error = e instanceof FbError ? e.message : `Lỗi khi gọi ${platform === "instagram" ? "Instagram" : "Facebook"}: ${e instanceof Error ? e.message : String(e)}`;
    if (opts.auto) warnOnce(`${wid}:${conv.pageId}:${action}:${e instanceof FbError ? e.code : "x"}`, `Tự động ${action} bình luận thất bại ở trang ${conv.pageId}: ${error}`);
    // Trả lời không gửi được vẫn lưu lại (failed) để nhân viên thấy và gửi lại.
    let failed: Message | null = null;
    if ((action === "reply" || action === "private_reply") && !opts.auto)
      failed = await db.message.create({ data: { conversationId: conv.id, direction: "out", kind: action === "reply" ? "comment" : "message", text, parentId: target.commentId, author: opts.actor, status: "failed", error } });
    return { ok: false, status: 502, error, message: failed ? toCommentMessage(failed) : null };
  }
  return { ok: false, status: 400, error: "Thao tác không hợp lệ" };
}
