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

/** Gửi tin tư vấn (CS) cho người đã quan tâm hoặc tương tác với OA. Zalo chỉ cho nhắn trong khung thời gian sau tương tác cuối. */
export async function sendZaloText(workspaceId: string, userId: string, text: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  let token = getSettings(ws).zalo?.accessToken;
  if (!token) token = await refresh(workspaceId);
  const send = (t: string) =>
    fetch("https://openapi.zalo.me/v3.0/oa/message/cs", {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: t },
      body: JSON.stringify({ recipient: { user_id: userId }, message: { text } }),
    }).then((r) => r.json() as Promise<{ error: number; message: string }>);
  let r = await send(token);
  if (r.error === -216 || r.error === -124) r = await send(await refresh(workspaceId));
  if (r.error !== 0) throw new Error(`Zalo báo lỗi ${r.error}: ${r.message}`);
}
