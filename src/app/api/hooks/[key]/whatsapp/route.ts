import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ingestLead } from "@/lib/sources/ingest";
import { applyMessageStatus, ingestEvents } from "@/lib/inbox";
import { credsOf, findAccount, touchWebhook } from "@/lib/channels/accounts";
import { parseWaWebhook, verifyWaSignature } from "@/lib/channels/whatsapp";
import { logHook, readBody, workspaceByHook } from "@/lib/channels/hook";

type P = { params: Promise<{ key: string }> };

// Webhook WhatsApp Cloud API (Meta App → WhatsApp → Configuration → Webhook, trường "messages").

/** Meta xác minh: hub.verify_token khớp Verify token của một số WhatsApp đã kết nối → trả hub.challenge. */
export async function GET(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const sp = new URL(req.url).searchParams;
  const token = sp.get("hub.verify_token") ?? "";
  if (sp.get("hub.mode") === "subscribe" && token) {
    const accounts = await db.channelAccount.findMany({ where: { workspaceId: ws.id, platform: "whatsapp" } });
    if (accounts.some((a) => credsOf("whatsapp", a).verifyToken === token)) return new Response(sp.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
    return fail("Verify token không khớp", 403);
  }
  return ok({ ok: true, provider: "WhatsApp", hint: "Webhook WhatsApp đang hoạt động." });
}

/** Tin nhắn khách + trạng thái gửi (sent/delivered/read/failed). Luôn trả 200 khi đã nhận để Meta không gửi lại liên tục. */
export async function POST(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const { raw, body } = await readBody(req);
  if (!body) return fail("Body không phải JSON hợp lệ");
  const groups = parseWaWebhook(body);
  if (!groups.length) {
    await logHook(ws, "whatsapp", "organic", "ignored", "Sự kiện WhatsApp không có tin/trạng thái", raw);
    return ok({ ok: true, messages: [], statuses: 0 });
  }
  const sig = req.headers.get("x-hub-signature-256");
  const results: unknown[] = [];
  let statuses = 0;
  for (const g of groups) {
    const acc = await findAccount(ws.id, "whatsapp", g.phoneNumberId);
    if (!acc) {
      await logHook(ws, "whatsapp", "organic", "ignored", `Số WhatsApp ${g.phoneNumberId} chưa kết nối ở Hộp thư → Kênh`, raw);
      continue;
    }
    if (!verifyWaSignature(raw, sig, credsOf("whatsapp", acc).appSecret)) {
      await logHook(ws, "whatsapp", "organic", "error", "Sai chữ ký X-Hub-Signature-256");
      return fail("Sai chữ ký", 401);
    }
    await touchWebhook(acc.id);
    try {
      if (g.events.length) results.push(...(await ingestEvents(ws, g.events, body)));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[hook whatsapp]", error);
      for (const ev of g.events) if (ev.lead) await ingestLead(ws, ev.lead, body).catch(() => null);
      await logHook(ws, "whatsapp", "organic", "error", error, raw);
    }
    for (const s of g.statuses) if (await applyMessageStatus(ws.id, "whatsapp", s.msgId, s.status, s.error).catch(() => false)) statuses++;
  }
  return ok({ ok: true, messages: results, statuses });
}
