// WhatsApp Cloud API (Meta Graph): webhook tin nhắn + trạng thái gửi, gửi tin văn bản trong cửa sổ 24 giờ,
// gửi mẫu tin (template) đã duyệt khi cửa sổ đã đóng.
//
// Tài liệu: POST /{phone-number-id}/messages, GET /{waba-id}/message_templates, webhook object "whatsapp_business_account".
// Chạy thử: token bắt đầu bằng "demo_" hoặc MESSAGING_DRY_RUN=1 → không gọi mạng.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChannelAccount, Conversation } from "@prisma/client";
import type { Attachment, InboxEvent, InboxReferral } from "../inbox";
import { GRAPH } from "../fb/graph";
import { credsOf, isDryRunCreds } from "./accounts";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown) => (v == null ? "" : String(v).trim());

export const WA_WINDOW_MS = 24 * 3600 * 1000;
export const WA_WINDOW_CLOSED = "Cửa sổ 24 giờ đã đóng — dùng mẫu tin";

export class WaError extends Error {
  constructor(
    message: string,
    public code = 0,
    public windowClosed = false,
  ) {
    super(message);
  }
}

/* ───────────── Webhook ───────────── */

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, body gốc). Chưa điền App Secret thì cho qua (thử nhanh). */
export function verifyWaSignature(raw: string, header: string | null, appSecret: string) {
  if (!appSecret) return true;
  const want = "sha256=" + createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const got = str(header);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export type WaStatus = { msgId: string; status: "sent" | "delivered" | "read" | "failed"; recipient: string; error: string; at?: Date };
export type WaParsed = { phoneNumberId: string; events: InboxEvent[]; statuses: WaStatus[] };

const tsDate = (v: unknown) => {
  const n = Number(v);
  return n ? new Date(n < 1e12 ? n * 1000 : n) : undefined;
};

/** Một tin WhatsApp → văn bản + tệp đính kèm hiển thị được trong Hộp thư. */
function waContent(m: Json): { text: string; atts: Attachment[] } {
  const t = str(m.type);
  switch (t) {
    case "text":
      return { text: str(m.text?.body), atts: [] };
    case "image":
    case "video":
    case "audio":
    case "sticker":
    case "document": {
      const o = m[t] ?? {};
      // Cloud API chỉ gửi media id; cần GET /{media-id} kèm token mới tải được — giữ tên/ghi chú.
      return { text: str(o.caption), atts: [{ type: t === "document" ? "file" : t, name: str(o.filename) || undefined }] };
    }
    case "location": {
      const l = m.location ?? {};
      return { text: [str(l.name), str(l.address)].filter(Boolean).join(" · "), atts: [{ type: "location", lat: Number(l.latitude) || undefined, lng: Number(l.longitude) || undefined }] };
    }
    case "button":
      return { text: `[Bấm nút] ${str(m.button?.text) || str(m.button?.payload)}`, atts: [] };
    case "interactive": {
      const i = m.interactive ?? {};
      return { text: `[Chọn] ${str(i.button_reply?.title) || str(i.list_reply?.title) || str(i.nfm_reply?.body)}`, atts: [] };
    }
    case "reaction":
      return { text: `[Bày tỏ cảm xúc] ${str(m.reaction?.emoji)}`, atts: [] };
    case "contacts":
      return { text: `[Danh bạ] ${(m.contacts ?? []).map((c: Json) => [str(c.name?.formatted_name), ...(c.phones ?? []).map((p: Json) => str(p.phone))].filter(Boolean).join(" ")).join("; ")}`, atts: [] };
    default:
      return { text: t === "unsupported" ? "[Tin WhatsApp chưa hỗ trợ]" : "", atts: t ? [{ type: "file" }] : [] };
  }
}

/** Quảng cáo Click-to-WhatsApp: referral.source_type = ad | post. */
function waReferral(r: Json | undefined): InboxReferral | undefined {
  if (!r || typeof r !== "object") return undefined;
  const src = str(r.source_type);
  if (src === "ad") return { source: "ad", ref: str(r.headline) || str(r.source_url), adId: str(r.source_id) || undefined };
  if (src === "post") return { source: "post", ref: str(r.source_url), postId: str(r.source_id) || undefined };
  return undefined;
}

const STATUS = new Set(["sent", "delivered", "read", "failed"]);

/** Phân tích webhook WhatsApp (thuần, không gọi DB) → tin cho Hộp thư + cập nhật trạng thái gửi. */
export function parseWaWebhook(body: Json): WaParsed[] {
  if (str(body?.object) !== "whatsapp_business_account") return [];
  const out: WaParsed[] = [];
  for (const entry of body.entry ?? [])
    for (const ch of entry.changes ?? []) {
      if (ch.field !== "messages") continue;
      const v: Json = ch.value ?? {};
      const phoneNumberId = str(v.metadata?.phone_number_id);
      if (!phoneNumberId) continue;
      const names = new Map<string, string>((v.contacts ?? []).map((c: Json) => [str(c.wa_id), str(c.profile?.name)]));
      const events: InboxEvent[] = [];
      for (const m of v.messages ?? []) {
        const from = str(m.from);
        if (!from) continue;
        const { text, atts } = waContent(m);
        const referral = waReferral(m.referral);
        events.push({
          channel: "whatsapp",
          externalId: from,
          pageId: phoneNumberId,
          direction: "in",
          text,
          attachments: atts,
          msgId: str(m.id),
          at: tsDate(m.timestamp),
          name: names.get(from) || undefined,
          ...(referral ? { referral } : {}),
          // wa_id chính là số điện thoại quốc tế của khách (vd. 84912345678) → tạo/gộp khách theo SĐT.
          lead: { provider: "whatsapp", providerLabel: "WhatsApp", channel: referral?.source === "ad" ? "ads" : "organic", name: names.get(from) || "Khách WhatsApp", phone: from, externalId: `wa:${str(m.id)}`, note: `Tin nhắn WhatsApp: ${text}` },
        });
      }
      const statuses: WaStatus[] = [];
      for (const s of v.statuses ?? []) {
        const st = str(s.status);
        if (!STATUS.has(st) || !str(s.id)) continue;
        const err = (s.errors ?? [])[0];
        statuses.push({ msgId: str(s.id), status: st as WaStatus["status"], recipient: str(s.recipient_id), error: err ? explainWaError(err).message : "", at: tsDate(s.timestamp) });
      }
      if (events.length || statuses.length) out.push({ phoneNumberId, events, statuses });
    }
  return out;
}

/* ───────────── Lỗi ───────────── */

type WaErr = { code?: number; message?: string; title?: string; error_data?: { details?: string }; error_subcode?: number };

/** Mã lỗi Cloud API → câu tiếng Việt. 131047 = quá 24 giờ (cần mẫu tin). */
export function explainWaError(e: WaErr, status = 0): WaError {
  const code = Number(e.code ?? 0);
  const detail = str(e.error_data?.details) || str(e.message) || str(e.title);
  if (code === 131047) return new WaError(`${WA_WINDOW_CLOSED}. Khách chưa nhắn trong 24 giờ qua nên WhatsApp chỉ cho gửi mẫu tin đã duyệt.`, code, true);
  if (code === 190 || (code === 0 && status === 401)) return new WaError("Access token WhatsApp hết hạn hoặc sai. Cập nhật ở Hộp thư → Kênh → WhatsApp.", code);
  if (code === 131026) return new WaError("Không gửi được: số này không dùng WhatsApp hoặc chưa đồng ý điều khoản mới.", code);
  if (code === 131051) return new WaError("Loại tin này WhatsApp không hỗ trợ.", code);
  if (code === 132001) return new WaError("Mẫu tin không tồn tại hoặc chưa được duyệt cho ngôn ngữ này.", code);
  if (code === 132000) return new WaError("Số biến của mẫu tin không khớp.", code);
  if (code === 130429 || code === 131048 || code === 131056 || code === 80007) return new WaError("WhatsApp đang giới hạn tốc độ gửi. Thử lại sau ít phút.", code);
  if (code === 100) return new WaError(`Tham số không hợp lệ: ${detail}`, code);
  return new WaError(`WhatsApp báo lỗi${code ? ` ${code}` : status ? ` ${status}` : ""}: ${detail || "không rõ"}`, code);
}

/* ───────────── Gửi ───────────── */

async function waFetch<T>(token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!token) throw new WaError("Số WhatsApp chưa có access token. Vào Hộp thư → Kênh → WhatsApp để điền.");
  const res = await fetch(`${GRAPH}/${path.replace(/^\//, "")}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  }).catch((e) => {
    throw new WaError(`Không kết nối được WhatsApp (${e instanceof Error && e.name === "TimeoutError" ? "quá thời gian chờ" : "mất mạng hoặc bị chặn"}).`);
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: WaErr };
  if (j.error || !res.ok) throw explainWaError(j.error ?? {}, res.status);
  return j;
}

/** Cửa sổ chăm sóc 24 giờ tính từ tin cuối của khách. */
export function waWindow(conv: Pick<Conversation, "lastInAt">, now = Date.now()) {
  const last = conv.lastInAt?.getTime() ?? 0;
  const closesAt = last ? new Date(last + WA_WINDOW_MS) : null;
  return { open: !!closesAt && closesAt.getTime() > now, closesAt };
}

const dryId = () => `wamid.dry_${randomBytes(6).toString("hex")}`;

/** Gửi tin văn bản (chỉ trong 24 giờ). Trả wamid. */
export async function sendWaText(account: ChannelAccount, to: string, text: string): Promise<string> {
  const c = credsOf("whatsapp", account);
  if (isDryRunCreds("whatsapp", account)) return dryId();
  const j = await waFetch<{ messages?: { id?: string }[] }>(c.accessToken, "POST", `${encodeURIComponent(c.phoneNumberId || account.accountId)}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
  return j.messages?.[0]?.id ?? "";
}

export type WaTemplate = { name: string; language: string; status: string; category: string; body: string; header: string; footer: string; params: number };

/** Số biến {{1}}, {{2}}... trong nội dung mẫu. */
export const countParams = (body: string) => new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
/** Điền biến để lưu bản xem trước của tin đã gửi. */
export const fillWaTemplate = (body: string, params: string[]) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => params[Number(n) - 1] ?? `{{${n}}}`);

export function toTemplate(t: Json): WaTemplate {
  const comps: Json[] = t.components ?? [];
  const body = str(comps.find((c) => c.type === "BODY")?.text);
  const header = comps.find((c) => c.type === "HEADER");
  return {
    name: str(t.name),
    language: str(t.language),
    status: str(t.status),
    category: str(t.category),
    body,
    header: header?.format === "TEXT" ? str(header.text) : header ? `[${str(header.format).toLowerCase()}]` : "",
    footer: str(comps.find((c) => c.type === "FOOTER")?.text),
    params: countParams(body),
  };
}

const DEMO_TEMPLATES: WaTemplate[] = [
  { name: "nhac_lich_hen", language: "vi", status: "APPROVED", category: "UTILITY", body: "Chào {{1}}, Hương Spa nhắc lịch hẹn của mình lúc {{2}}. Trả lời tin này nếu cần đổi lịch nhé!", header: "", footer: "Hương Spa", params: 2 },
  { name: "xac_nhan_don", language: "vi", status: "APPROVED", category: "UTILITY", body: "Đơn {{1}} của {{2}} đã được xác nhận, tổng tiền {{3}}. Cảm ơn mình đã tin chọn!", header: "", footer: "", params: 3 },
  { name: "cham_soc_lai", language: "vi", status: "APPROVED", category: "MARKETING", body: "Chào {{1}}, lâu rồi chưa gặp mình! Tháng này bên em có ưu đãi 20% cho khách quen. Mình muốn em giữ lịch không ạ?", header: "", footer: "", params: 1 },
  { name: "khuyen_mai_moi", language: "vi", status: "PENDING", category: "MARKETING", body: "Ưu đãi mới cho {{1}}…", header: "", footer: "", params: 1 },
];

/** Mẫu tin của WABA (mọi trạng thái; giao diện chỉ cho chọn APPROVED). */
export async function listWaTemplates(account: ChannelAccount): Promise<{ items: WaTemplate[]; simulated: boolean }> {
  const c = credsOf("whatsapp", account);
  if (isDryRunCreds("whatsapp", account)) return { items: DEMO_TEMPLATES, simulated: true };
  if (!c.wabaId) throw new WaError("Chưa điền WhatsApp Business Account ID nên chưa tải được mẫu tin.");
  const j = await waFetch<{ data?: Json[] }>(c.accessToken, "GET", `${encodeURIComponent(c.wabaId)}/message_templates?fields=name,status,language,category,components&limit=100`);
  return { items: (j.data ?? []).map(toTemplate), simulated: false };
}

/** Gửi mẫu tin đã duyệt với biến phần thân. Trả wamid. */
export async function sendWaTemplate(account: ChannelAccount, to: string, tpl: { name: string; language: string }, params: string[]): Promise<string> {
  const c = credsOf("whatsapp", account);
  if (isDryRunCreds("whatsapp", account)) return dryId();
  const components = params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [];
  const j = await waFetch<{ messages?: { id?: string }[] }>(c.accessToken, "POST", `${encodeURIComponent(c.phoneNumberId || account.accountId)}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: { name: tpl.name, language: { code: tpl.language }, ...(components.length ? { components } : {}) },
  });
  return j.messages?.[0]?.id ?? "";
}

/** Kiểm tra token: GET /{phone-number-id}?fields=display_phone_number,verified_name. */
export async function waPhoneInfo(account: ChannelAccount): Promise<{ displayPhone: string; name: string; simulated?: boolean }> {
  const c = credsOf("whatsapp", account);
  if (isDryRunCreds("whatsapp", account)) return { displayPhone: "", name: "", simulated: true };
  const j = await waFetch<{ display_phone_number?: string; verified_name?: string }>(c.accessToken, "GET", `${encodeURIComponent(c.phoneNumberId || account.accountId)}?fields=display_phone_number,verified_name`);
  return { displayPhone: str(j.display_phone_number), name: str(j.verified_name) };
}
