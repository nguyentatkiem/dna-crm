import webpush from "web-push";
import { db } from "./db";

export type PushPayload = { title: string; body: string; url?: string };

/** Khoá VAPID công khai (rỗng = chưa cấu hình, nút bật thông báo đẩy sẽ ẩn). */
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() ?? "";

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());

let ready = false;
function setup() {
  if (ready) return true;
  if (!pushConfigured()) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:admin@dnacrm.local", vapidPublicKey(), process.env.VAPID_PRIVATE_KEY!.trim());
    ready = true;
  } catch (e) {
    console.error("[push] VAPID sai:", e instanceof Error ? e.message : e);
  }
  return ready;
}

/** Lưu (hoặc cập nhật) đăng ký của một trình duyệt. */
export async function saveSubscription(workspaceId: string, userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const data = { workspaceId, userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await db.pushSub.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db.pushSub.deleteMany({ where: { userId, endpoint } });
}

/** Gửi tới một nhóm đăng ký; đăng ký hết hạn (404/410) thì xoá. Trả về số lần gửi thành công. */
async function sendTo(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], p: PushPayload) {
  if (!subs.length || !setup()) return 0;
  const payload = JSON.stringify({ title: p.title.slice(0, 120), body: p.body.slice(0, 300), url: p.url || "/w" });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSub.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("[push]", code ?? "", e instanceof Error ? e.message : e);
      }
    }),
  );
  return sent;
}

/** Gửi thông báo đẩy tới mọi trình duyệt của một người. Không cấu hình VAPID thì không làm gì. */
export async function sendPushToUser(workspaceId: string, userId: string, p: PushPayload) {
  if (!pushConfigured() || !userId) return 0;
  try {
    const subs = await db.pushSub.findMany({ where: { workspaceId, userId } });
    return await sendTo(subs, p);
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Gửi cho cả workspace (dùng khi thông báo không gắn người cụ thể). */
export async function sendPushToWorkspace(workspaceId: string, p: PushPayload) {
  if (!pushConfigured()) return 0;
  try {
    return await sendTo(await db.pushSub.findMany({ where: { workspaceId } }), p);
  } catch (e) {
    console.error("[push]", e instanceof Error ? e.message : e);
    return 0;
  }
}
