import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Integrations } from "../settings";
import type { Channel, Lead } from "./ingest";
import type { Attachment, InboxComment, InboxEvent, InboxPostEvent, InboxReferral } from "../inbox";
import { instagramEvents } from "../channels/instagram";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { raw: string; body: Json; headers: Headers; settings: Integrations; url: URL };

export type Provider = {
  key: string;
  label: string;
  channel: Channel;
  /** Hướng dẫn ngắn hiện ở trang Nguồn khách. */
  guide: string;
  /** Các ô khoá cần điền: [tên trường trong settings, nhãn]. */
  secrets: [string, string][];
  /** Trả lời GET khi nền tảng xác minh webhook (Facebook cần). */
  challenge?: (c: Omit<Ctx, "body" | "raw">) => string | null;
  /** false = sai chữ ký, bỏ qua yêu cầu. Không cấu hình khoá thì cho qua để học viên thử nhanh. */
  verify?: (c: Ctx) => boolean;
  parse: (c: Ctx) => Promise<Lead[]> | Lead[];
  /** Tin nhắn cho Hộp thư (Zalo OA, Messenger). Tách khỏi luồng lead; lead lần đầu đi kèm trong từng tin. */
  messages?: (c: Ctx) => InboxEvent[];
};

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hmac = (algo: "sha256", key: string, data: string, enc: "hex" | "base64") => createHmac(algo, key).update(data, "utf8").digest(enc);
const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** Shopify, Haravan, Sapo cùng kiểu: header HMAC-SHA256 base64 trên body gốc. */
const hmacHeader = (headers: string[], secret?: string) => (c: Ctx) =>
  !secret || safeEq(str(headers.map((h) => c.headers.get(h)).find(Boolean)), hmac("sha256", secret, c.raw, "base64"));

/** Tìm giá trị theo nhiều tên khoá hay gặp (form Ladipage, Pancake, n8n, Google Sheets...). */
function pick(o: Json, keys: string[]) {
  const flat: Json = {};
  for (const [k, v] of Object.entries(o)) flat[k.toLowerCase().replace(/[\s-]/g, "_")] = v;
  for (const k of keys) if (flat[k] != null && str(flat[k])) return str(flat[k]);
  return "";
}
const NAME_KEYS = ["name", "full_name", "fullname", "ho_ten", "hoten", "ho_va_ten", "ten", "customer_name", "your_name"];
const PHONE_KEYS = ["phone", "phone_number", "so_dien_thoai", "sodienthoai", "sdt", "mobile", "tel", "dien_thoai"];
const EMAIL_KEYS = ["email", "e_mail", "mail"];
const PHONE_RE = /(?:\+?84|0)(?:\d[\s.]?){8,9}\d/;
const tsDate = (v: unknown) => {
  const n = Number(v);
  return n ? new Date(n < 1e12 ? n * 1000 : n) : undefined;
};
const NOTE_KEYS = ["message", "note", "ghi_chu", "noi_dung", "nhu_cau", "content", "comment"];

/** Đơn kiểu Shopify (Haravan, Sapo dùng cùng cấu trúc). */
function shopifyOrder(provider: string, label: string, o: Json): Lead[] {
  if (!o || (!o.id && !o.order_number)) return [];
  const cust = o.customer ?? {};
  const addr = o.shipping_address ?? o.billing_address ?? {};
  const name = str(addr.name) || [cust.last_name, cust.first_name].filter(Boolean).join(" ") || str(o.email) || "Khách đặt hàng";
  const state = o.cancelled_at || o.cancel_reason ? "lost" : ["paid", "partially_paid"].includes(str(o.financial_status)) ? "won" : "open";
  return [
    {
      provider,
      providerLabel: label,
      channel: "ecommerce",
      name,
      phone: str(o.phone) || str(cust.phone) || str(addr.phone),
      email: str(o.email) || str(cust.email),
      externalId: `${o.id}:${state}`,
      note: str(o.note),
      order: {
        code: str(o.name || o.order_number || o.id),
        amount: Number(o.total_price) || 0,
        items: (o.line_items ?? []).map((i: Json) => `${i.title ?? i.name} x${i.quantity ?? 1}`).join(", "),
        state,
      },
    },
  ];
}

/** Sàn TMĐT chỉ đẩy mã đơn + trạng thái, thông tin người mua bị che: tạo đơn để theo dõi, không tạo khách giả. */
function marketOrder(provider: string, label: string, code: string, status: string, amount = 0): Lead[] {
  if (!code) return [];
  const s = status.toUpperCase();
  const state = /CANCEL|RETURN|FAILED|UNPAID_CANCEL/.test(s) ? "lost" : /COMPLETED|DELIVERED|CONFIRMED|SHIPPED|TO_CONFIRM_RECEIVE/.test(s) ? "won" : "open";
  return [{ provider, providerLabel: label, channel: "ecommerce", name: `Người mua ${label}`, externalId: `${code}:${s}`, note: `Trạng thái đơn: ${status}`, order: { code, amount, items: "", state } }];
}

function utmChannel(b: Json): Channel {
  const m = pick(b, ["utm_medium"]).toLowerCase();
  if (/cpc|ppc|paid|ads?$|cpm|banner/.test(m)) return "ads";
  if (pick(b, ["utm_source", "gclid", "fbclid", "ttclid"])) return m ? "organic" : "ads";
  return "website";
}

/** referral của Messenger → nguồn hội thoại. */
export function toReferral(r: Json | undefined): InboxReferral | undefined {
  if (!r || typeof r !== "object") return undefined;
  const src = str(r.source).toUpperCase();
  const adId = str(r.ad_id);
  const ref = str(r.ref);
  if (adId || src === "ADS") return { source: "ad", ref, adId: adId || undefined, postId: str(r.ads_context_data?.post_id) || undefined };
  if (src === "CUSTOMER_CHAT_PLUGIN") return { source: "website", ref: ref || str(r.referer_uri) };
  if (ref || src === "SHORTLINK" || src === "MESSENGER_CODE") return { source: "ref", ref };
  return undefined;
}

const FEED_POST_KIND: Record<string, InboxPostEvent["kind"]> = { status: "post", post: "post", share: "post", photo: "photo", video: "video" };

/**
 * Sự kiện "feed" của trang → InboxEvent. item = comment: bình luận (verb add/edited/remove/hide/unhide);
 * item = status/photo/video/post: bài viết mới của trang. Bỏ qua reaction, like...
 */
export function feedEvents(pageId: string, v: Json): InboxEvent[] {
  const item = str(v.item);
  const verb = str(v.verb) as InboxComment["verb"];
  const at = tsDate(v.created_time);
  const postObj: Json = v.post ?? {};
  const live = /live/i.test(str(postObj.status_type)) || str(postObj.live_status) !== "" || !!v.is_live;
  const postKind: InboxPostEvent["kind"] = live ? "live" : /video/.test(str(postObj.status_type)) ? "video" : /photo/.test(str(postObj.status_type)) ? "photo" : "post";
  if (item === "comment") {
    if (!["add", "edited", "remove", "hide", "unhide"].includes(verb)) return [];
    const postId = str(v.post_id) || str(postObj.id);
    const commentId = str(v.comment_id);
    const fromId = str(v.from?.id);
    if (!postId || !commentId) return [];
    const fromPage = !!fromId && fromId === pageId;
    const photo = str(v.photo);
    const atts: Attachment[] = photo ? [{ type: "image", url: photo }] : v.video ? [{ type: "video", url: str(v.video) }] : [];
    return [
      {
        channel: "messenger",
        kind: "comment",
        externalId: fromPage ? "" : `c:${postId}:${fromId}`,
        pageId,
        direction: fromPage ? "out" : "in",
        text: str(v.message),
        attachments: atts,
        msgId: commentId,
        at,
        name: str(v.from?.name) || undefined,
        comment: {
          commentId,
          parentId: str(v.parent_id) && str(v.parent_id) !== postId ? str(v.parent_id) : "",
          postId,
          senderId: fromId,
          verb,
          fromPage,
          post: { kind: postKind, live, permalink: str(postObj.permalink_url) || undefined },
        },
      },
    ];
  }
  if (FEED_POST_KIND[item] && (verb === "add" || verb === "edited" || verb === "remove")) {
    const postId = str(v.post_id);
    if (!postId) return [];
    const kind = live ? "live" : FEED_POST_KIND[item];
    return [{ channel: "messenger", externalId: "", pageId, direction: "out", text: "", post: { postId, kind, live, message: str(v.message), permalink: item === "photo" ? "" : str(v.link), image: item === "photo" ? str(v.link) : "", at, remove: verb === "remove" } }];
  }
  return [];
}

export const PROVIDERS: Provider[] = [
  {
    key: "facebook",
    label: "Facebook Lead Ads",
    channel: "ads",
    guide:
      "Meta for Developers → App → Webhooks → Page → đăng ký trường leadgen (và messages, messaging_postbacks, messaging_referrals để tin Messenger về Hộp thư; feed để bình luận về Hộp thư), dán URL bên dưới và Verify token. Cấp Page Access Token có quyền leads_retrieval để CRM tải được tên, SĐT của lead.",
    secrets: [
      ["verifyToken", "Verify token (tự đặt)"],
      ["pageToken", "Page Access Token"],
      ["appSecret", "App Secret (kiểm tra chữ ký)"],
    ],
    challenge: ({ url, settings }) =>
      url.searchParams.get("hub.mode") === "subscribe" && settings.facebook?.verifyToken && url.searchParams.get("hub.verify_token") === settings.facebook.verifyToken
        ? url.searchParams.get("hub.challenge")
        : null,
    verify: (c) => {
      const sec = c.settings.facebook?.appSecret;
      return !sec || safeEq(str(c.headers.get("x-hub-signature-256")), "sha256=" + hmac("sha256", sec, c.raw, "hex"));
    },
    async parse({ body, settings }) {
      const out: Lead[] = [];
      for (const entry of body.entry ?? [])
        for (const ch of entry.changes ?? []) {
          if (ch.field !== "leadgen") continue;
          const v = ch.value ?? {};
          const lead: Lead = { provider: "facebook", providerLabel: "Facebook", channel: "ads", name: `Lead Facebook #${v.leadgen_id}`, externalId: str(v.leadgen_id) };
          const token = settings.facebook?.pageToken;
          if (token && v.leadgen_id) {
            const res = await fetch(`https://graph.facebook.com/v23.0/${v.leadgen_id}?fields=field_data,campaign_name,ad_name,form_id&access_token=${encodeURIComponent(token)}`);
            const d: Json = await res.json().catch(() => ({}));
            const fields: Json = {};
            for (const f of d.field_data ?? []) fields[f.name] = (f.values ?? []).join(", ");
            lead.name = pick(fields, NAME_KEYS) || lead.name;
            lead.phone = pick(fields, PHONE_KEYS);
            lead.email = pick(fields, EMAIL_KEYS);
            lead.campaign = str(d.campaign_name) || str(d.ad_name);
            lead.extra = Object.fromEntries(Object.entries(fields).filter(([k]) => ![...NAME_KEYS, ...PHONE_KEYS, ...EMAIL_KEYS].includes(k)));
            if (d.error) lead.note = `Không tải được chi tiết lead: ${d.error.message}`;
          } else lead.note = "Chưa có Page Access Token nên chưa tải được tên và SĐT. Điền token ở trang Nguồn khách.";
          out.push(lead);
        }
      return out;
    },
    messages({ body }) {
      // Cùng ứng dụng Meta: webhook Instagram (object "instagram") trỏ chung URL này cũng được nhận.
      if (str(body.object) === "instagram") return instagramEvents(body);
      const out: InboxEvent[] = [];
      for (const entry of body.entry ?? []) {
        // Bình luận / bài viết trên trang (trường "feed").
        for (const ch of entry.changes ?? []) if (ch.field === "feed") out.push(...feedEvents(str(entry.id), ch.value ?? {}));
        for (const m of entry.messaging ?? []) {
          const msg = m.message;
          const post = m.postback;
          // Nguồn: quảng cáo Click-to-Messenger, link m.me?ref=, plugin chat website (referral ở message, postback hoặc sự kiện riêng).
          const referral = toReferral(m.referral ?? post?.referral ?? msg?.referral);
          if (!msg && !post) {
            if (referral && m.sender?.id)
              out.push({ channel: "messenger", externalId: str(m.sender.id), pageId: str(m.recipient?.id) || str(entry.id), direction: "in", text: "", msgId: `ref:${m.sender.id}:${m.timestamp}`, at: tsDate(m.timestamp), system: true, referral });
            continue; // bỏ qua delivery/read/reaction
          }
          const echo = !!msg?.is_echo;
          // Echo: Trang gửi cho khách (từ CRM hoặc Meta Business Suite) → người dùng là recipient.
          const psid = str(echo ? m.recipient?.id : m.sender?.id);
          const pageId = str(echo ? m.sender?.id : m.recipient?.id) || str(entry.id);
          const atts: Attachment[] = (msg?.attachments ?? []).map((a: Json) =>
            a.type === "location"
              ? { type: "location", lat: a.payload?.coordinates?.lat, lng: a.payload?.coordinates?.long }
              : { type: msg?.sticker_id ? "sticker" : str(a.type) || "file", url: str(a.payload?.url) || undefined, name: str(a.title) || undefined },
          );
          const text = post ? `[Bấm nút] ${str(post.title) || str(post.payload)}` : str(msg?.text);
          const mid = str(msg?.mid) || (post ? `postback:${psid}:${m.timestamp}` : "");
          const phone = text.match(PHONE_RE)?.[0];
          out.push({
            channel: "messenger",
            externalId: psid,
            pageId,
            direction: echo ? "out" : "in",
            text,
            attachments: atts,
            msgId: mid,
            at: tsDate(m.timestamp),
            ...(referral && !echo ? { referral } : {}),
            // Messenger không có SĐT: chỉ tạo lead khi khách tự nhắn số điện thoại (Hộp thư nhận diện kỹ hơn bằng detectContact).
            lead:
              !echo && phone
                ? { provider: "facebook", providerLabel: "Facebook Messenger", channel: referral?.source === "ad" ? "ads" : "organic", name: "Khách nhắn Messenger", phone, externalId: `msg:${mid}`, note: `Tin nhắn: ${text}`, campaign: referral?.adId ? `Quảng cáo ${referral.adId}` : undefined }
                : undefined,
          });
        }
      }
      return out;
    },
  },
  {
    key: "google",
    label: "Google Ads (Lead form)",
    channel: "ads",
    guide: "Google Ads → Tài sản biểu mẫu khách hàng tiềm năng → Tích hợp webhook: dán URL bên dưới và Khoá (key). Bấm Gửi dữ liệu thử để kiểm tra.",
    secrets: [["key", "Khoá webhook (google_key)"]],
    verify: (c) => !c.settings.google?.key || str(c.body.google_key) === c.settings.google.key,
    parse({ body }) {
      const col: Json = {};
      for (const c of body.user_column_data ?? []) col[str(c.column_id).toLowerCase()] = str(c.string_value);
      const name = col.full_name || [col.last_name, col.first_name].filter(Boolean).join(" ");
      return [
        {
          provider: "google",
          providerLabel: "Google Ads",
          channel: "ads",
          name: name || "Lead Google Ads",
          phone: col.phone_number,
          email: col.email,
          externalId: str(body.lead_id),
          campaign: str(body.campaign_id) && `Campaign ${body.campaign_id}`,
          note: body.is_test ? "Dữ liệu thử từ Google Ads" : undefined,
          extra: Object.fromEntries(Object.entries(col).filter(([k]) => !["full_name", "first_name", "last_name", "phone_number", "email"].includes(k))) as Record<string, string>,
        },
      ];
    },
  },
  {
    key: "tiktok",
    label: "TikTok Lead Ads",
    channel: "ads",
    guide: "TikTok Ads Manager → Tài sản → Sự kiện/CRM → Webhook (hoặc qua Zapier/Make/n8n): đẩy về URL bên dưới. Nhận các trường tên, SĐT, email theo tên chuẩn.",
    secrets: [["secret", "Mã bí mật (gửi kèm header x-crm-secret)"]],
    verify: (c) => !c.settings.tiktok?.secret || str(c.headers.get("x-crm-secret")) === c.settings.tiktok.secret,
    parse({ body }) {
      const items: Json[] = Array.isArray(body.data) ? body.data : body.lead ? [body.lead] : [body];
      return items.map((it) => {
        const fields: Json = { ...it };
        for (const f of it.field_data ?? it.fields ?? []) fields[str(f.name ?? f.key)] = f.value ?? (f.values ?? []).join(", ");
        return {
          provider: "tiktok",
          providerLabel: "TikTok",
          channel: "ads" as Channel,
          name: pick(fields, NAME_KEYS) || "Lead TikTok",
          phone: pick(fields, PHONE_KEYS),
          email: pick(fields, EMAIL_KEYS),
          externalId: str(it.lead_id ?? it.id),
          campaign: str(it.campaign_name ?? it.ad_name),
        };
      });
    },
  },
  {
    key: "zalo",
    label: "Zalo OA",
    channel: "zalo",
    guide:
      "developers.zalo.me → ứng dụng → Webhook: dán URL bên dưới, bật sự kiện follow, user_submit_info và nhóm tin nhắn (user_send_text, user_send_image, user_send_file, user_send_sticker, user_send_location, oa_send_text) để tin về Hộp thư. Điền App ID + OA Secret Key để kiểm tra chữ ký, Access token để CRM nhắn lại khách.",
    secrets: [
      ["appId", "App ID"],
      ["secretKey", "OA Secret Key"],
      ["accessToken", "OA Access Token"],
      ["refreshToken", "Refresh Token"],
    ],
    verify: (c) => {
      const z = c.settings.zalo;
      if (!z?.appId || !z.secretKey) return true;
      const sig = str(c.headers.get("x-zevent-signature")).replace(/^mac=/, "");
      return safeEq(sig, createHash("sha256").update(z.appId + c.raw + str(c.body.timestamp) + z.secretKey).digest("hex"));
    },
    parse({ body }) {
      // Tin nhắn và sự kiện quan tâm đi qua messages() (Hộp thư); lead lần đầu được tạo kèm ở đó.
      if (str(body.event_name) !== "user_submit_info") return [];
      const uid = str(body.sender?.id ?? body.user_id_by_app);
      const i = body.info ?? {};
      return [{ provider: "zalo", providerLabel: "Zalo OA", channel: "zalo", zaloUid: uid, name: str(i.name) || "Khách Zalo", phone: str(i.phone), externalId: `info:${uid}:${body.timestamp}`, note: [i.address, i.ward, i.district, i.city].filter(Boolean).join(", ") }];
    },
    messages({ body }) {
      const ev = str(body.event_name);
      const at = tsDate(body.timestamp);
      if (ev === "follow") {
        const uid = str(body.follower?.id ?? body.user_id_by_app);
        return [
          {
            channel: "zalo",
            externalId: uid,
            direction: "in",
            text: "Khách vừa quan tâm OA",
            attachments: [{ type: "event" }],
            msgId: `follow:${uid}:${body.timestamp}`,
            at,
            system: true,
            lead: { provider: "zalo", providerLabel: "Zalo OA", channel: "zalo", zaloUid: uid, name: "Người theo dõi Zalo OA", externalId: `follow:${uid}`, note: "Khách vừa quan tâm OA" },
          },
        ];
      }
      const inbound = ev.startsWith("user_send_");
      if (!inbound && !ev.startsWith("oa_send_")) return [];
      const kind = ev.replace(/^(user|oa)_send_/, "");
      const m = body.message ?? {};
      const uid = str(inbound ? body.sender?.id : body.recipient?.id) || str(body.user_id_by_app);
      const atts: Attachment[] = (m.attachments ?? []).map((a: Json) => {
        const p = a.payload ?? {};
        if (a.type === "location") return { type: "location", lat: Number(p.coordinates?.latitude) || undefined, lng: Number(p.coordinates?.longitude) || undefined };
        return { type: str(a.type) || kind, url: str(p.url || p.thumbnail) || undefined, name: str(p.name) || undefined };
      });
      if (!atts.length && kind !== "text") atts.push({ type: kind === "gif" ? "gif" : kind });
      const text = str(m.text);
      const msgId = str(m.msg_id) || `${ev}:${uid}:${body.timestamp}`;
      const phone = text.match(PHONE_RE)?.[0];
      return [
        {
          channel: "zalo",
          externalId: uid,
          direction: inbound ? "in" : "out",
          text,
          attachments: atts,
          msgId,
          at,
          lead: inbound ? { provider: "zalo", providerLabel: "Zalo OA", channel: "zalo", zaloUid: uid, name: "Khách nhắn Zalo OA", phone, externalId: msgId, note: `Tin nhắn: ${text || `[${kind}]`}` } : undefined,
        },
      ];
    },
  },
  {
    key: "webhook",
    label: "Website, Landing page, n8n/Make",
    channel: "website",
    guide:
      "Dùng cho Ladipage, WordPress (Contact Form 7, Elementor), Google Sheets, n8n, Make, Zapier, Pancake... Gửi POST JSON hoặc form với các trường name, phone, email, note và utm_source, utm_medium, utm_campaign. CRM tự nhận diện tên trường tiếng Việt (ho_ten, so_dien_thoai...).",
    secrets: [["secret", "Mã bí mật (header x-crm-secret, không bắt buộc)"]],
    verify: (c) => !c.settings.webhook?.secret || str(c.headers.get("x-crm-secret")) === c.settings.webhook.secret,
    parse({ body }) {
      const items: Json[] = Array.isArray(body) ? body : Array.isArray(body.leads) ? body.leads : [body];
      return items.map((b) => {
        const channel = utmChannel(b);
        const src = pick(b, ["utm_source", "source", "nguon"]);
        return {
          provider: "webhook",
          providerLabel: src ? src[0].toUpperCase() + src.slice(1) : "Website",
          channel,
          name: pick(b, NAME_KEYS) || "Khách từ website",
          phone: pick(b, PHONE_KEYS),
          email: pick(b, EMAIL_KEYS),
          note: pick(b, NOTE_KEYS),
          campaign: pick(b, ["utm_campaign", "campaign", "chien_dich"]),
          externalId: pick(b, ["id", "lead_id", "submission_id"]),
          extra: { "Trang": pick(b, ["page", "url", "page_url", "referrer"]), "Nội dung QC": pick(b, ["utm_content"]) },
        };
      });
    },
  },
  {
    key: "shopify",
    label: "Shopify",
    channel: "ecommerce",
    guide: "Shopify Admin → Settings → Notifications → Webhooks: tạo webhook Order creation, Order payment, Order cancellation (JSON) trỏ về URL bên dưới. Điền khoá ký webhook.",
    secrets: [["secret", "Webhook signing secret"]],
    verify: (c) => hmacHeader(["x-shopify-hmac-sha256"], c.settings.shopify?.secret)(c),
    parse: ({ body }) => shopifyOrder("shopify", "Shopify", body),
  },
  {
    key: "haravan",
    label: "Haravan",
    channel: "ecommerce",
    guide: "Haravan → Ứng dụng → Webhook: chọn orders/create, orders/paid, orders/cancelled trỏ về URL bên dưới. Điền khoá bí mật của ứng dụng.",
    secrets: [["secret", "Khoá bí mật webhook"]],
    verify: (c) => hmacHeader(["x-haravan-hmacsha256", "x-haravan-hmac-sha256"], c.settings.haravan?.secret)(c),
    parse: ({ body }) => shopifyOrder("haravan", "Haravan", body),
  },
  {
    key: "sapo",
    label: "Sapo",
    channel: "ecommerce",
    guide: "Sapo → Cấu hình → Webhook (hoặc app riêng): đăng ký orders/create, orders/paid, orders/cancelled trỏ về URL bên dưới.",
    secrets: [["secret", "Khoá bí mật webhook"]],
    verify: (c) => hmacHeader(["x-sapo-hmacsha256", "x-sapo-hmac-sha256"], c.settings.sapo?.secret)(c),
    parse: ({ body }) => shopifyOrder("sapo", "Sapo", body.order ?? body),
  },
  {
    key: "woocommerce",
    label: "WooCommerce",
    channel: "ecommerce",
    guide: "WordPress → WooCommerce → Cài đặt → Nâng cao → Webhooks: thêm webhook Order created và Order updated, Delivery URL là URL bên dưới, Secret tự đặt.",
    secrets: [["secret", "Secret của webhook"]],
    verify: (c) => hmacHeader(["x-wc-webhook-signature"], c.settings.woocommerce?.secret)(c),
    parse({ body: o }) {
      if (!o?.id) return [];
      const b = o.billing ?? {};
      const st = str(o.status);
      const state = ["cancelled", "refunded", "failed"].includes(st) ? "lost" : ["completed", "processing"].includes(st) ? "won" : "open";
      return [
        {
          provider: "woocommerce",
          providerLabel: "Website (WooCommerce)",
          channel: "ecommerce",
          name: [b.last_name, b.first_name].filter(Boolean).join(" ") || "Khách đặt hàng",
          phone: str(b.phone),
          email: str(b.email),
          externalId: `${o.id}:${state}`,
          note: str(o.customer_note),
          order: { code: str(o.number ?? o.id), amount: Number(o.total) || 0, items: (o.line_items ?? []).map((i: Json) => `${i.name} x${i.quantity}`).join(", "), state },
        },
      ];
    },
  },
  {
    key: "shopee",
    label: "Shopee",
    channel: "ecommerce",
    guide: "Shopee Open Platform → App → Push Mechanism: bật Order Status Push, URL bên dưới. Sàn che SĐT người mua nên CRM tạo đơn để theo dõi doanh thu theo kênh.",
    secrets: [["partnerKey", "Partner Key"]],
    verify: (c) => {
      const k = c.settings.shopee?.partnerKey;
      return !k || safeEq(str(c.headers.get("authorization")), hmac("sha256", k, `${c.url.origin}${c.url.pathname}|${c.raw}`, "hex"));
    },
    parse: ({ body }) => marketOrder("shopee", "Shopee", str(body.data?.ordersn), str(body.data?.status)),
  },
  {
    key: "lazada",
    label: "Lazada",
    channel: "ecommerce",
    guide: "Lazada Open Platform → App Console → Push Mechanism: bật Trade Order, URL bên dưới.",
    secrets: [["appSecret", "App Secret"]],
    parse: ({ body }) => marketOrder("lazada", "Lazada", str(body.data?.trade_order_id), str(body.data?.order_status)),
  },
  {
    key: "tiktokshop",
    label: "TikTok Shop",
    channel: "ecommerce",
    guide: "TikTok Shop Partner Center → App → Webhooks: bật Order Status Change, URL bên dưới. Điền App Key + App Secret để kiểm tra chữ ký.",
    secrets: [
      ["appKey", "App Key"],
      ["appSecret", "App Secret"],
    ],
    verify: (c) => {
      const t = c.settings.tiktokshop;
      return !t?.appKey || !t.appSecret || safeEq(str(c.headers.get("authorization")), hmac("sha256", t.appSecret, t.appKey + c.raw, "hex"));
    },
    parse: ({ body }) => marketOrder("tiktokshop", "TikTok Shop", str(body.data?.order_id), str(body.data?.order_status ?? body.data?.order_status_change)),
  },
];

export const getProvider = (key: string) => PROVIDERS.find((p) => p.key === key);
