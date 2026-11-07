import { fail, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { ingestLead } from "@/lib/sources/ingest";
import { getProvider } from "@/lib/sources/providers";
import { ingestEvents } from "@/lib/inbox";
import { instagramEvents } from "@/lib/channels/instagram";
import { logHook, readBody, workspaceByHook } from "@/lib/channels/hook";

type P = { params: Promise<{ key: string }> };

// Webhook Instagram (Meta App → Webhooks → Instagram: messages, comments, live_comments).
// Cùng ứng dụng Meta với fanpage: Verify token và App Secret lấy ở Nguồn khách → Facebook.

export async function GET(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const url = new URL(req.url);
  const answer = getProvider("facebook")!.challenge?.({ headers: req.headers, settings: getSettings(ws), url });
  if (answer) return new Response(answer, { headers: { "Content-Type": "text/plain" } });
  return ok({ ok: true, provider: "Instagram", hint: "Webhook Instagram đang hoạt động." });
}

export async function POST(req: Request, { params }: P) {
  const ws = await workspaceByHook((await params).key);
  if (!ws) return fail("Không tìm thấy", 404);
  const { raw, body } = await readBody(req);
  if (!body) return fail("Body không phải JSON hợp lệ");
  const settings = getSettings(ws);
  const fb = getProvider("facebook")!;
  if (fb.verify && !fb.verify({ raw, body, headers: req.headers, settings, url: new URL(req.url) })) {
    await logHook(ws, "instagram", "organic", "error", "Sai chữ ký X-Hub-Signature-256");
    return fail("Sai chữ ký", 401);
  }
  const events = instagramEvents(body);
  if (!events.length) {
    await logHook(ws, "instagram", "organic", "ignored", "Sự kiện Instagram không có tin/bình luận", raw);
    return ok({ ok: true, messages: [] });
  }
  try {
    const messages = await ingestEvents(ws, events, body);
    return ok({ ok: true, messages });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[hook instagram]", error);
    // Hộp thư lỗi: vẫn giữ lead (khách nhắn SĐT) để không mất khách.
    for (const ev of events) if (ev.lead) await ingestLead(ws, ev.lead, body).catch(() => null);
    await logHook(ws, "instagram", "organic", "error", error, raw);
    return ok({ ok: false, error });
  }
}
