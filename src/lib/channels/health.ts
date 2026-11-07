// HỢP ĐỒNG: trang Kiểm tra kết nối gọi hàm này. Kiểm tra từng tài khoản Instagram / WhatsApp / Shopee / TikTok Shop:
// có token, lần cuối nhận webhook, hạn token của shop, và (live = true, khoá thật) gọi thử API.
import type { Check } from "../health/types";
import { db } from "../db";
import { fetchPageInfo, FbError, isDemoToken } from "../fb/graph";
import { credsOf, isDryRunCreds, PLATFORM_LABEL, settingsOf, type Platform } from "./accounts";
import { waPhoneInfo } from "./whatsapp";
import { shopeeShopInfo } from "./shopee";
import { tiktokShops } from "./tiktok";

const GROUP = "Kênh chat & sàn";
const HREF = "/w/inbox/pages";
const DAY = 864e5;

const ago = (d: Date) => {
  const m = Math.round((Date.now() - d.getTime()) / 60e3);
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return `${Math.round(m / 1440)} ngày trước`;
};

export async function health(workspaceId: string, opts: { live?: boolean } = {}): Promise<Check[]> {
  const out: Check[] = [];
  const [igPages, accounts] = await Promise.all([
    db.fbPage.findMany({ where: { workspaceId, platform: "instagram" } }),
    db.channelAccount.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
  ]);

  /* Instagram (FbPage platform "instagram") */
  for (const p of igPages) {
    const base = { key: `instagram:${p.pageId}`, group: GROUP, label: `Instagram · ${p.name || p.pageId}`, fixHref: `${HREF}?tab=instagram` };
    if (!p.active) {
      out.push({ ...base, status: "off", detail: "Đang tắt — tin và bình luận Instagram không vào Hộp thư." });
      continue;
    }
    if (!p.token) {
      out.push({ ...base, status: "error", detail: "Chưa có Page Access Token của fanpage liên kết." });
      continue;
    }
    const last = await db.message.findFirst({ where: { direction: "in", conversation: { workspaceId, channel: "instagram", pageId: p.pageId } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const lastTxt = last ? `Tin gần nhất ${ago(last.createdAt)}.` : "Chưa nhận tin nào — kiểm tra webhook object “instagram”.";
    if (isDemoToken(p.token) || process.env.MESSAGING_DRY_RUN === "1") {
      out.push({ ...base, status: "warn", detail: `Chạy thử (token mẫu): gửi/ẩn/trả lời được giả lập. ${lastTxt}` });
      continue;
    }
    if (opts.live) {
      try {
        await fetchPageInfo(p.pageId, p.token);
        out.push({ ...base, status: "ok", detail: `Token hợp lệ. ${lastTxt}`, testable: true });
      } catch (e) {
        out.push({ ...base, status: "error", detail: e instanceof FbError ? e.message : "Không gọi được Instagram Graph API.", testable: true });
      }
    } else out.push({ ...base, status: last && Date.now() - last.createdAt.getTime() < 7 * DAY ? "ok" : "warn", detail: `Có token. ${lastTxt}`, testable: true });
  }

  /* WhatsApp / Shopee / TikTok Shop */
  for (const a of accounts) {
    const platform = a.platform as Platform;
    if (!PLATFORM_LABEL[platform]) continue;
    const s = settingsOf(a);
    const base = { key: `${platform}:${a.accountId}`, group: GROUP, label: `${PLATFORM_LABEL[platform]} · ${a.name || a.accountId}`, fixHref: `${HREF}?tab=${platform}` };
    if (!a.active) {
      out.push({ ...base, status: "off", detail: "Đang tắt." });
      continue;
    }
    const dry = isDryRunCreds(platform, a);
    const hook = s.lastWebhookAt ? `Webhook gần nhất ${ago(new Date(s.lastWebhookAt))}.` : "Chưa nhận webhook nào.";

    if (platform === "whatsapp") {
      const c = credsOf("whatsapp", a);
      if (!c.accessToken) {
        out.push({ ...base, status: "error", detail: "Chưa có access token — chưa gửi được tin WhatsApp." });
        continue;
      }
      const miss = [!c.appSecret && "App Secret (kiểm chữ ký)", !c.wabaId && "WABA ID (mẫu tin)", !c.verifyToken && "Verify token"].filter(Boolean);
      if (dry) {
        out.push({ ...base, status: "warn", detail: `Chạy thử (token demo_): tin và mẫu tin được giả lập. ${hook}` });
        continue;
      }
      if (opts.live) {
        try {
          const info = await waPhoneInfo(a);
          out.push({ ...base, status: miss.length ? "warn" : "ok", detail: `Token hợp lệ${info.displayPhone ? ` (${info.displayPhone})` : ""}. ${hook}${miss.length ? ` Còn thiếu: ${miss.join(", ")}.` : ""}`, testable: true });
        } catch (e) {
          out.push({ ...base, status: "error", detail: e instanceof Error ? e.message : "Không gọi được WhatsApp Cloud API.", testable: true });
        }
      } else out.push({ ...base, status: miss.length || !s.lastWebhookAt ? "warn" : "ok", detail: `Có token. ${hook}${miss.length ? ` Còn thiếu: ${miss.join(", ")}.` : ""}`, testable: true });
      continue;
    }

    // Shopee / TikTok Shop
    const c = platform === "shopee" ? credsOf("shopee", a) : credsOf("tiktok", a);
    if (a.accountId.startsWith("pending_") || !c.accessToken) {
      out.push({ ...base, status: "error", detail: "Shop chưa uỷ quyền — bấm “Kết nối qua sàn” để lấy token." });
      continue;
    }
    const sync = a.lastSyncAt ? `Đồng bộ đơn ${ago(a.lastSyncAt)}${s.lastSyncCount !== undefined ? ` (${s.lastSyncCount} đơn)` : ""}.` : "Chưa đồng bộ đơn lần nào.";
    if (dry) {
      out.push({ ...base, status: "warn", detail: `Chạy thử (khoá demo_): đơn mẫu, không gọi sàn. ${sync}` });
      continue;
    }
    const refreshExp = c.refreshExpiresAt ? new Date(c.refreshExpiresAt).getTime() : 0;
    const expWarn = refreshExp && refreshExp - Date.now() < 5 * DAY ? ` Refresh token hết hạn ${refreshExp < Date.now() ? "rồi" : `sau ${Math.ceil((refreshExp - Date.now()) / DAY)} ngày`} — uỷ quyền lại.` : "";
    if (refreshExp && refreshExp < Date.now()) {
      out.push({ ...base, status: "error", detail: `Token đã hết hạn, cần uỷ quyền lại. ${sync}` });
      continue;
    }
    if (opts.live) {
      try {
        if (platform === "shopee") await shopeeShopInfo(a);
        else await tiktokShops(a);
        out.push({ ...base, status: expWarn || s.lastError ? "warn" : "ok", detail: `Gọi thử thành công. ${sync}${expWarn}`, testable: true });
      } catch (e) {
        out.push({ ...base, status: "error", detail: e instanceof Error ? e.message : "Không gọi được API sàn.", testable: true });
      }
    } else {
      const stale = !a.lastSyncAt || Date.now() - a.lastSyncAt.getTime() > 60 * 60e3;
      out.push({ ...base, status: s.lastError ? "error" : expWarn || stale ? "warn" : "ok", detail: `${s.lastError ? `Lỗi lần đồng bộ trước: ${s.lastError}. ` : ""}${sync} ${hook}${expWarn}`.trim(), testable: true });
    }
  }
  return out;
}
