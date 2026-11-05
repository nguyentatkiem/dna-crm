import { db } from "./db";
import { getSettings } from "./settings";

const GRAPH = "https://graph.facebook.com/v23.0";

/** Lỗi gửi Messenger. windowClosed = đã quá 24 giờ kể từ tin cuối của khách. */
export class MessengerError extends Error {
  constructor(
    message: string,
    public windowClosed = false,
  ) {
    super(message);
  }
}

async function pageToken(workspaceId: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const t = getSettings(ws).facebook?.pageToken;
  if (!t) throw new MessengerError("Chưa có Page Access Token. Điền token ở trang Nguồn khách → Facebook để trả lời Messenger từ CRM.");
  return t;
}

/**
 * Gửi tin văn bản qua Send API. Mặc định là tin trả lời (RESPONSE) trong 24 giờ sau tin cuối của khách;
 * humanAgent = true dùng tag HUMAN_AGENT (cho phép tới 7 ngày, app cần được Meta duyệt quyền này).
 * Trả message_id (mid) để chống trùng khi Facebook gửi lại echo.
 */
export async function sendMessengerText(workspaceId: string, psid: string, text: string, opts: { humanAgent?: boolean } = {}): Promise<string> {
  const token = await pageToken(workspaceId);
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
  if (!token) return null;
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
