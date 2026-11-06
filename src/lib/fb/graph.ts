// Gọi Facebook Graph API cho fanpage: bình luận (trả lời, nhắn riêng, ẩn, thích, xoá), thông tin trang và bài viết.
//
// Chạy thử không cần Facebook thật: đặt MESSAGING_DRY_RUN=1, hoặc dùng token mẫu (DEMO_PAGE_TOKEN / bắt đầu bằng "demo_")
// thì mọi lệnh ghi được giả lập thành công (trả id dạng "dry_…"), không gọi mạng.
// Token không bao giờ được ghi ra log hay trả về trình duyệt.
import { randomBytes } from "node:crypto";

export const GRAPH = "https://graph.facebook.com/v23.0";
export const DEMO_PAGE_TOKEN = "demo_page_token";

export class FbError extends Error {
  constructor(
    message: string,
    public code = 0,
    /** Đã quá 24 giờ / 7 ngày nên không nhắn riêng được nữa. */
    public windowClosed = false,
  ) {
    super(message);
  }
}

export const isDemoToken = (t?: string | null) => !!t && (t === DEMO_PAGE_TOKEN || t.startsWith("demo_"));
export const isDryRun = (token?: string | null) => process.env.MESSAGING_DRY_RUN === "1" || isDemoToken(token);
const dryId = (p: string) => `dry_${p}_${randomBytes(5).toString("hex")}`;

type GraphErr = { message?: string; code?: number; error_subcode?: number; type?: string };

/** Lỗi Graph → câu tiếng Việt dễ hiểu (không lộ token). */
export function explainGraphError(e: GraphErr, status = 0): FbError {
  const code = e.code ?? 0;
  const sub = e.error_subcode ?? 0;
  if (code === 190) return new FbError("Page Access Token hết hạn hoặc sai. Vào Hộp thư → Trang để cấp lại token.", code);
  if (code === 10 && sub === 2018278) return new FbError("Đã quá thời hạn nhắn tin cho khách (24 giờ). Thử nhắn bằng kênh khác hoặc gọi điện.", code, true);
  if (code === 10 || code === 200 || code === 3) return new FbError("Trang chưa cấp đủ quyền cho ứng dụng (cần pages_manage_engagement, pages_messaging, pages_read_user_content).", code);
  if (code === 100 && /private repl/i.test(e.message ?? "")) return new FbError("Bình luận này đã được nhắn riêng hoặc đã quá 7 ngày nên không nhắn riêng được nữa.", code, true);
  if (code === 100) return new FbError(`Không tìm thấy bình luận/bài viết trên Facebook (có thể đã bị xoá). ${e.message ?? ""}`.trim(), code);
  if (code === 368) return new FbError("Facebook tạm chặn thao tác này vì nghi spam. Thử lại sau ít phút.", code);
  if (code === 4 || code === 17 || code === 32 || code === 613) return new FbError("Facebook đang giới hạn số lần gọi. Thử lại sau ít phút.", code);
  if (code === 551) return new FbError("Khách hiện không nhận tin từ Trang.", code);
  return new FbError(`Facebook báo lỗi${code ? ` ${code}` : status ? ` ${status}` : ""}: ${e.message ?? "không rõ"}`, code);
}

/** Gọi Graph API với token trang. Lỗi mạng / lỗi Facebook đều thành FbError tiếng Việt. */
export async function graph<T = Record<string, unknown>>(token: string, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!token) throw new FbError("Trang chưa có Page Access Token. Vào Hộp thư → Trang để kết nối.");
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  let body: string | undefined;
  if (method === "GET" || method === "DELETE") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  else body = JSON.stringify(params);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body, signal: AbortSignal.timeout(10000) }).catch((e) => {
    // Không in URL (có token).
    throw new FbError(`Không kết nối được Facebook (${e instanceof Error && e.name === "TimeoutError" ? "quá thời gian chờ" : "mất mạng hoặc bị chặn"}).`);
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: GraphErr };
  if (j.error || !res.ok) throw explainGraphError(j.error ?? {}, res.status);
  return j;
}

/* ───────────── Trang & bài viết ───────────── */

/** Kiểm tra token bằng GET /{page-id}?fields=name,picture. */
export async function fetchPageInfo(pageId: string, token: string): Promise<{ id: string; name: string; avatar: string; simulated?: boolean }> {
  if (isDryRun(token)) return { id: pageId, name: "", avatar: "", simulated: true };
  const j = await graph<{ id?: string; name?: string; picture?: { data?: { url?: string } } }>(token, "GET", encodeURIComponent(pageId), { fields: "name,picture" });
  return { id: j.id ?? pageId, name: j.name ?? "", avatar: j.picture?.data?.url ?? "" };
}

export type FbPostInfo = { postId: string; message: string; image: string; permalink: string; kind: "post" | "photo" | "video" | "live"; live: boolean; postedAt: Date | null; commentsCount: number };

const kindOf = (statusType: string, live: boolean): FbPostInfo["kind"] =>
  live ? "live" : /video/.test(statusType) ? "video" : /photo/.test(statusType) ? "photo" : "post";

type RawPost = { id: string; message?: string; full_picture?: string; permalink_url?: string; status_type?: string; created_time?: string; comments?: { summary?: { total_count?: number } }; live_status?: string };
const toInfo = (p: RawPost): FbPostInfo => {
  const live = !!p.live_status || /live/i.test(p.status_type ?? "");
  return { postId: p.id, message: p.message ?? "", image: p.full_picture ?? "", permalink: p.permalink_url ?? "", kind: kindOf(p.status_type ?? "", live), live, postedAt: p.created_time ? new Date(p.created_time) : null, commentsCount: p.comments?.summary?.total_count ?? 0 };
};
const POST_FIELDS = "message,full_picture,permalink_url,status_type,created_time,comments.summary(true).limit(0)";

/** Thông tin một bài viết (nội dung, ảnh, link, loại). Chạy thử thì trả null (giữ dữ liệu đang có). */
export async function fetchPost(token: string, postId: string): Promise<FbPostInfo | null> {
  if (isDryRun(token)) return null;
  return toInfo(await graph<RawPost>(token, "GET", encodeURIComponent(postId), { fields: POST_FIELDS }));
}

/** 25 bài mới nhất của trang (đồng bộ danh sách bài viết). */
export async function fetchRecentPosts(token: string, pageId: string, limit = 25): Promise<FbPostInfo[]> {
  if (isDryRun(token)) return [];
  const j = await graph<{ data?: RawPost[] }>(token, "GET", `${encodeURIComponent(pageId)}/posts`, { fields: POST_FIELDS, limit });
  return (j.data ?? []).map(toInfo);
}

/* ───────────── Bình luận ───────────── */

/** Trả lời công khai dưới bình luận. Trả id bình luận mới. */
export async function replyComment(token: string, commentId: string, text: string): Promise<string> {
  if (isDryRun(token)) return dryId("comment");
  const j = await graph<{ id?: string }>(token, "POST", `${encodeURIComponent(commentId)}/comments`, { message: text });
  return j.id ?? "";
}

/**
 * Nhắn riêng (inbox) cho người bình luận: Send API với recipient { comment_id }.
 * Facebook chỉ cho một lần cho mỗi bình luận, trong 7 ngày. Trả recipient_id (PSID) và message_id.
 */
export async function privateReply(token: string, commentId: string, text: string): Promise<{ recipientId: string; messageId: string }> {
  if (isDryRun(token)) return { recipientId: "", messageId: dryId("mid") };
  const j = await graph<{ recipient_id?: string; message_id?: string }>(token, "POST", "me/messages", { recipient: { comment_id: commentId }, message: { text } });
  return { recipientId: j.recipient_id ?? "", messageId: j.message_id ?? "" };
}

/** Ẩn / hiện bình luận (is_hidden). Người bình luận và bạn bè họ vẫn thấy. */
export async function setCommentHidden(token: string, commentId: string, hidden: boolean): Promise<void> {
  if (isDryRun(token)) return;
  await graph(token, "POST", encodeURIComponent(commentId), { is_hidden: hidden });
}

/** Trang thích / bỏ thích bình luận. */
export async function likeComment(token: string, commentId: string, like = true): Promise<void> {
  if (isDryRun(token)) return;
  await graph(token, like ? "POST" : "DELETE", `${encodeURIComponent(commentId)}/likes`);
}

/** Xoá hẳn bình luận trên Facebook. */
export async function deleteComment(token: string, commentId: string): Promise<void> {
  if (isDryRun(token)) return;
  await graph(token, "DELETE", encodeURIComponent(commentId));
}
