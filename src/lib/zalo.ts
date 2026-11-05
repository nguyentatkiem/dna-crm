import { db } from "./db";
import { getSettings, saveSettings } from "./settings";

/** Access token OA hết hạn sau ~25 giờ: đổi refresh token lấy token mới (refresh token cũng đổi theo). */
async function refresh(workspaceId: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const z = getSettings(ws).zalo;
  if (!z?.appId || !z.secretKey || !z.refreshToken) throw new Error("Thiếu App ID, Secret Key hoặc Refresh Token của Zalo OA");
  const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", secret_key: z.secretKey },
    body: new URLSearchParams({ app_id: z.appId, refresh_token: z.refreshToken, grant_type: "refresh_token" }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`Không làm mới được token Zalo: ${j.error_description ?? res.status}`);
  await saveSettings(workspaceId, { zalo: { accessToken: j.access_token, refreshToken: j.refresh_token ?? z.refreshToken } });
  return j.access_token;
}

type ZaloRes = { error: number; message: string; data?: Record<string, unknown> };

/** Gọi Open API của OA, tự làm mới token khi hết hạn. */
async function call(workspaceId: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<ZaloRes> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  let token = getSettings(ws).zalo?.accessToken;
  if (!token) token = await refresh(workspaceId);
  const go = (t: string) =>
    fetch(url, {
      method: init.method ?? "POST",
      headers: { "Content-Type": "application/json", access_token: t },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10000),
    }).then((r) => r.json() as Promise<ZaloRes>);
  let r = await go(token);
  if (r.error === -216 || r.error === -124) r = await go(await refresh(workspaceId));
  return r;
}

/** Lỗi gửi tin hay gặp, đổi sang lời khuyên dễ hiểu. */
function sendError(r: ZaloRes) {
  if (r.error === -230 || r.error === -213 || /interact|follow/i.test(r.message))
    return `Zalo báo lỗi ${r.error}: khách chưa quan tâm OA hoặc đã quá thời hạn nhắn tư vấn sau tương tác cuối. Hãy dùng tin ZNS hoặc gọi điện.`;
  return `Zalo báo lỗi ${r.error}: ${r.message}`;
}

/** Gửi tin tư vấn (CS) cho người đã quan tâm hoặc tương tác với OA. Zalo chỉ cho nhắn trong khung thời gian sau tương tác cuối. Trả msg_id của Zalo. */
export async function sendZaloText(workspaceId: string, userId: string, text: string): Promise<string> {
  const r = await call(workspaceId, "https://openapi.zalo.me/v3.0/oa/message/cs", { body: { recipient: { user_id: userId }, message: { text } } });
  if (r.error !== 0) throw new Error(sendError(r));
  return String(r.data?.message_id ?? "");
}

/** Gửi ảnh kèm chú thích (ảnh phải là URL công khai). */
export async function sendZaloImage(workspaceId: string, userId: string, imageUrl: string, caption = ""): Promise<string> {
  const r = await call(workspaceId, "https://openapi.zalo.me/v3.0/oa/message/cs", {
    body: {
      recipient: { user_id: userId },
      message: { text: caption, attachment: { type: "template", payload: { template_type: "media", elements: [{ media_type: "image", url: imageUrl }] } } },
    },
  });
  if (r.error !== 0) throw new Error(sendError(r));
  return String(r.data?.message_id ?? "");
}

/** Tên và ảnh đại diện của người dùng Zalo. Chưa có token hoặc lỗi thì trả null, không làm hỏng luồng nhận tin. */
export async function getZaloProfile(workspaceId: string, userId: string): Promise<{ name: string; avatar: string } | null> {
  try {
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (!getSettings(ws).zalo?.accessToken) return null;
    const r = await call(workspaceId, `https://openapi.zalo.me/v3.0/oa/user/detail?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`, { method: "GET" });
    if (r.error !== 0 || !r.data) return null;
    return { name: String(r.data.display_name ?? ""), avatar: String(r.data.avatar ?? "") };
  } catch {
    return null;
  }
}
