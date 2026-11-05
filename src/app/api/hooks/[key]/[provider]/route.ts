import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { ingestLead } from "@/lib/sources/ingest";
import { getProvider } from "@/lib/sources/providers";

type P = { params: Promise<{ key: string; provider: string }> };

async function load(params: P["params"]) {
  const { key, provider } = await params;
  const ws = await db.workspace.findUnique({ where: { hookKey: key } });
  const p = getProvider(provider);
  return ws && p ? { ws, p } : null;
}

/** Facebook gọi GET để xác minh webhook: trả lại hub.challenge khi verify token khớp. */
export async function GET(req: Request, { params }: P) {
  const found = await load(params);
  if (!found) return fail("Không tìm thấy", 404);
  const url = new URL(req.url);
  const answer = found.p.challenge?.({ headers: req.headers, settings: getSettings(found.ws), url });
  if (answer) return new Response(answer, { headers: { "Content-Type": "text/plain" } });
  return ok({ ok: true, provider: found.p.label, hint: "Webhook đang hoạt động. Gửi POST để đẩy lead." });
}

/** Nhận lead/đơn từ mọi nguồn. Luôn trả 200 nhanh khi đã nhận để nền tảng không gửi lại liên tục. */
export async function POST(req: Request, { params }: P) {
  const found = await load(params);
  if (!found) return fail("Không tìm thấy", 404);
  const { ws, p } = found;
  const raw = await req.text();
  const type = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  try {
    body = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(raw)) : raw ? JSON.parse(raw) : {};
  } catch {
    return fail("Body không phải JSON hợp lệ");
  }
  const ctx = { raw, body, headers: req.headers, settings: getSettings(ws), url: new URL(req.url) };
  if (p.verify && !p.verify(ctx)) {
    await db.leadEvent.create({ data: { workspaceId: ws.id, provider: p.key, channel: p.channel, status: "error", message: "Sai chữ ký hoặc khoá bí mật" } });
    return fail("Sai chữ ký", 401);
  }
  try {
    const leads = await p.parse(ctx);
    const results = [];
    for (const lead of leads) results.push(await ingestLead(ws, lead, body));
    if (!leads.length) await db.leadEvent.create({ data: { workspaceId: ws.id, provider: p.key, channel: p.channel, status: "ignored", message: "Sự kiện không chứa lead", payloadJson: raw.slice(0, 20000) } });
    return ok({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.leadEvent.create({ data: { workspaceId: ws.id, provider: p.key, channel: p.channel, status: "error", message, payloadJson: raw.slice(0, 20000) } });
    return ok({ ok: false, error: message });
  }
}
