// Instagram (tài khoản chuyên nghiệp liên kết fanpage) qua Messenger Platform for Instagram:
// webhook object "instagram" — entry[].messaging[] (Direct) và entry[].changes[] field "comments" / "live_comments".
// Lưu như FbPage platform "instagram": pageId = Instagram user id (IG professional account id), token = Page Access Token
// của fanpage liên kết. Gửi DM: POST /me/messages (token trang), trả lời bình luận: POST /{comment-id}/replies,
// ẩn: POST /{comment-id}?hide=true, nhắn riêng từ bình luận: POST /me/messages recipient { comment_id }.
import type { Attachment, InboxEvent, InboxPostEvent } from "../inbox";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const tsDate = (v: unknown) => {
  const n = Number(v);
  return n ? new Date(n < 1e12 ? n * 1000 : n) : undefined;
};
const PHONE_RE = /(?:\+?84|0)(?:\d[\s.]?){8,9}\d/;

const ATT_TYPE: Record<string, string> = { image: "image", video: "video", audio: "audio", file: "file", share: "link", story_mention: "link", ig_reel: "video", reel: "video", ig_post: "link", animated_image: "gif" };

const mediaKind = (productType: string, live: boolean): InboxPostEvent["kind"] => (live ? "live" : /REEL|VIDEO|IGTV/i.test(productType) ? "video" : "post");

/** Webhook Instagram → InboxEvent (thuần, không gọi mạng). */
export function instagramEvents(body: Json): InboxEvent[] {
  if (str(body?.object) !== "instagram") return [];
  const out: InboxEvent[] = [];
  for (const entry of body.entry ?? []) {
    const igId = str(entry.id);
    // Bình luận trên bài / reel / live.
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "comments" && ch.field !== "live_comments") continue;
      const v: Json = ch.value ?? {};
      const commentId = str(v.id);
      const mediaId = str(v.media?.id);
      const fromId = str(v.from?.id);
      if (!commentId || !mediaId) continue;
      const fromPage = !!fromId && fromId === igId;
      const live = ch.field === "live_comments";
      out.push({
        channel: "instagram",
        kind: "comment",
        externalId: fromPage ? "" : `c:${mediaId}:${fromId}`,
        pageId: igId,
        direction: fromPage ? "out" : "in",
        text: str(v.text),
        msgId: commentId,
        at: tsDate(entry.time),
        name: str(v.from?.username) ? `@${str(v.from.username)}` : undefined,
        comment: {
          commentId,
          parentId: str(v.parent_id),
          postId: mediaId,
          senderId: fromId,
          verb: "add",
          fromPage,
          post: { kind: mediaKind(str(v.media?.media_product_type), live), live },
        },
      });
    }
    // Tin nhắn Direct.
    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      const post = m.postback;
      if (!msg && !post) continue; // read, reaction, seen...
      if (msg?.is_deleted) continue;
      const echo = !!msg?.is_echo;
      const igsid = str(echo ? m.recipient?.id : m.sender?.id);
      const pageId = str(echo ? m.sender?.id : m.recipient?.id) || igId;
      if (!igsid) continue;
      const atts: Attachment[] = (msg?.attachments ?? []).map((a: Json) => ({ type: ATT_TYPE[str(a.type)] ?? "file", url: str(a.payload?.url) || undefined, name: str(a.type) === "story_mention" ? "Nhắc bạn trong tin" : undefined }));
      let text = post ? `[Bấm nút] ${str(post.title) || str(post.payload)}` : str(msg?.text);
      if (!text && msg?.reply_to?.story) text = "[Trả lời tin (story)]";
      const mid = str(msg?.mid) || (post ? `postback:${igsid}:${m.timestamp}` : "");
      const phone = text.match(PHONE_RE)?.[0];
      out.push({
        channel: "instagram",
        externalId: igsid,
        pageId,
        direction: echo ? "out" : "in",
        text,
        attachments: atts,
        msgId: mid,
        at: tsDate(m.timestamp),
        lead: !echo && phone ? { provider: "instagram", providerLabel: "Instagram", channel: "organic", name: "Khách nhắn Instagram", phone, externalId: `ig:${mid}`, note: `Tin nhắn Instagram: ${text}` } : undefined,
      });
    }
  }
  return out;
}
