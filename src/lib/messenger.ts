import { randomBytes } from "node:crypto";
import { GRAPH, isDryRun } from "./fb/graph";
import { pageTokenFor } from "./fb/pages";

/** Lỗi gửi Messenger. windowClosed = đã quá 24 giờ kể từ tin cuối của khách. */
export class MessengerError extends Error {
  constructor(
    message: string,
    public windowClosed = false,
  ) {
    super(message);
  }
}

/** Token của trang nhận tin (Hộp thư → Trang), không có thì dùng token chung ở Nguồn khách → Facebook. */
async function pageToken(workspaceId: string, pageId?: string) {
  const { token } = await pageTokenFor(workspaceId, pageId);
  if (!token) throw new MessengerError("Chưa có Page Access Token. Kết nối trang ở Hộp thư → Trang (hoặc Nguồn khách → Facebook) để trả lời Messenger từ CRM.");
  return token;
}

/**
 * Gửi tin văn bản qua Send API. Mặc định là tin trả lời (RESPONSE) trong 24 giờ sau tin cuối của khách;
 * humanAgent = true dùng tag HUMAN_AGENT (cho phép tới 7 ngày, app cần được Meta duyệt quyền này).
 * Trả message_id (mid) để chống trùng khi Facebook gửi lại echo.
 */
export async function sendMessengerText(workspaceId: string, psid: string, text: string, opts: { humanAgent?: boolean; pageId?: string } = {}): Promise<string> {
  const token = await pageToken(workspaceId, opts.pageId);
  // Chạy thử (MESSAGING_DRY_RUN=1 hoặc token mẫu): không gọi Facebook.
  if (isDryRun(token)) return `dry_mid_${randomBytes(5).toString("hex")}`;
  const body = opts.humanAgent
    ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", recipient: { id: psid }, message: { text } }
    : { messaging_type: "RESPONSE", recipient: { id: psid }, message: { text } };
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  }).catch((e) => {
    throw new MessengerError(`Không kết nối được Facebook: ${e instanceof Error ? e.message : e}`);
  });
  const j = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string; code?: number; error_subcode?: number } };
  if (j.error || !res.ok) {
    const e = j.error ?? {};
    if (e.code === 10 || e.error_subcode === 2018278 || e.code === 551)
      throw new MessengerError(
        e.error_subcode === 2018278 || e.code === 10
          ? "Đã quá 24 giờ kể từ tin cuối của khách nên Facebook không cho gửi tin thường. Thử gửi lại với tag HUMAN_AGENT (trong 7 ngày), hoặc chuyển sang nhắn Zalo/ZNS, gọi điện."
          : `Khách hiện không nhận tin từ Trang (${e.message ?? "551"}).`,
        e.code === 10 || e.error_subcode === 2018278,
      );
    if (e.code === 190) throw new MessengerError("Page Access Token hết hạn hoặc sai. Cấp lại token ở trang Nguồn khách.");
    throw new MessengerError(`Facebook báo lỗi${e.code ? ` ${e.code}` : ""}: ${e.message ?? res.status}`);
  }
  return j.message_id ?? "";
}

/** Tên và ảnh đại diện của người nhắn (PSID). Không có token hoặc lỗi thì trả null. */
export async function getMessengerProfile(token: string | undefined, psid: string): Promise<{ name: string; avatar: string } | null> {
  if (!token || isDryRun(token)) return null;
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(4000) });
    const j = (await res.json().catch(() => ({}))) as { first_name?: string; last_name?: string; profile_pic?: string; error?: unknown };
    if (j.error || !res.ok) return null;
    // Tên Việt: họ trước tên sau.
    const name = [j.last_name, j.first_name].filter(Boolean).join(" ");
    return name ? { name, avatar: j.profile_pic ?? "" } : null;
  } catch {
    return null;
  }
}

/* ───────────── Instagram Direct ───────────── */

/**
 * Gửi tin Instagram Direct qua Messenger Platform for Instagram: cùng Send API POST /me/messages với Page Access Token
 * của fanpage liên kết, recipient = IGSID. Cửa sổ 24 giờ và tag HUMAN_AGENT (7 ngày) như Messenger.
 * pageId = Instagram user id (FbPage platform "instagram") để lấy đúng token.
 */
export async function sendInstagramText(workspaceId: string, igsid: string, text: string, opts: { humanAgent?: boolean; pageId?: string } = {}): Promise<string> {
  try {
    return await sendMessengerText(workspaceId, igsid, text, opts);
  } catch (e) {
    if (e instanceof MessengerError) throw new MessengerError(e.message.replace(/Messenger/g, "Instagram").replace(/Facebook/g, "Instagram"), e.windowClosed);
    throw e;
  }
}

/** Tên và ảnh của người nhắn Instagram (IGSID): GET /{igsid}?fields=name,username,profile_pic. */
export async function getInstagramProfile(token: string | undefined, igsid: string): Promise<{ name: string; avatar: string } | null> {
  if (!token || isDryRun(token)) return null;
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(igsid)}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(4000) });
    const j = (await res.json().catch(() => ({}))) as { name?: string; username?: string; profile_pic?: string; error?: unknown };
    if (j.error || !res.ok) return null;
    const name = j.name || (j.username ? `@${j.username}` : "");
    return name ? { name, avatar: j.profile_pic ?? "" } : null;
  } catch {
    return null;
  }
}
