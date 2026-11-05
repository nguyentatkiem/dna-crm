import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { findContact, loadConfig, normPhone } from "@/lib/sources/ingest";
import { scoreCall, sttConfigured, transcribeDetailed, UPLOAD_DIR } from "@/lib/calls";

type Json = Record<string, unknown>;
const first = (o: Json, keys: string[]) => {
  for (const k of keys) if (o[k] != null && String(o[k]).trim()) return String(o[k]).trim();
  return "";
};

/**
 * Webhook tổng đài: Stringee (event URL), OMICall, VoIP24h, FreeSWITCH/Asterisk qua script, n8n...
 * Gửi POST khi cuộc gọi kết thúc với các trường thường gặp: call_id, from, to, direction, duration, recording_url, agent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ws = await db.workspace.findUnique({ where: { hookKey: key } });
  if (!ws) return fail("Không tìm thấy", 404);
  const secret = getSettings(ws).call?.secret;
  if (secret && req.headers.get("x-crm-secret") !== secret) return fail("Sai mã bí mật", 401);
  const raw = await req.text();
  let b: Json = {};
  try {
    b = (req.headers.get("content-type") ?? "").includes("form-urlencoded") ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || "{}");
  } catch {
    return fail("Body không phải JSON hợp lệ");
  }
  const flat: Json = { ...b, ...((b.data as Json) ?? {}), ...((b.call as Json) ?? {}) };

  const externalId = first(flat, ["call_id", "callId", "uuid", "id", "transaction_id"]);
  if (externalId && (await db.call.findFirst({ where: { workspaceId: ws.id, provider: "pbx", externalId } }))) return ok({ ok: true, duplicate: true });
  const dir = first(flat, ["direction", "call_type", "type"]).toLowerCase();
  const inbound = /in|incoming|inbound|vào/.test(dir) && !/out/.test(dir);
  const from = first(flat, ["from", "caller", "from_number", "src", "caller_number"]);
  const to = first(flat, ["to", "callee", "to_number", "dst", "destination", "customer_number"]);
  const phone = normPhone(inbound ? from : to) || normPhone(to) || normPhone(from);
  const duration = Number(first(flat, ["duration", "billsec", "answer_duration", "answerDuration", "talk_time"])) || 0;
  const status = first(flat, ["status", "call_status", "disposition", "hangup_cause", "end_reason"]).toUpperCase();
  const outcome = duration > 0 || /ANSWER(ED)?$|SUCCESS|NORMAL_CLEARING/.test(status) ? "connected" : /BUSY/.test(status) ? "busy" : "no_answer";
  const agentName = first(flat, ["agent", "agent_name", "user", "extension", "ext", "user_id"]) || "Tổng đài";
  const recordingUrl = first(flat, ["recording_url", "recordingUrl", "record_url", "recordUrl", "recording", "file_url"]);

  const cfg = await loadConfig(ws.id);
  const contact = cfg && phone ? await findContact(ws.id, cfg, phone) : null;
  const call = await db.call.create({
    data: { workspaceId: ws.id, recordId: contact?.id, phone, direction: inbound ? "in" : "out", agentName, outcome, durationSec: Math.round(duration), provider: "pbx", externalId, recordingUrl, note: status ? `Tổng đài báo: ${status}` : "" },
  });
  if (contact) {
    await db.activity.create({ data: { recordId: contact.id, kind: "call", body: `Cuộc gọi ${inbound ? "đến" : "đi"} qua tổng đài, ${Math.round(duration)} giây (${agentName}).`, author: "Tổng đài" } });
  }

  // Tải ghi âm về máy ngay (link của nhà mạng thường hết hạn sau vài ngày), rồi chép lời + chấm điểm ở nền.
  if (recordingUrl && /^https?:\/\//.test(recordingUrl)) {
    void (async () => {
      try {
        const res = await fetch(recordingUrl);
        if (!res.ok) throw new Error(`Tải ghi âm lỗi ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = recordingUrl.match(/\.(mp3|wav|m4a|ogg)(\?|$)/i)?.[1]?.toLowerCase() ?? "mp3";
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.writeFile(path.join(UPLOAD_DIR, `${call.id}.${ext}`), buf);
        let updated = await db.call.update({ where: { id: call.id }, data: { recordingPath: `${call.id}.${ext}` } });
        if (sttConfigured()) {
          const r = await transcribeDetailed(buf, `${call.id}.${ext}`);
          if (r) updated = await db.call.update({ where: { id: call.id }, data: { transcript: r.text, segmentsJson: r.segments ? JSON.stringify(r.segments) : "" } });
          await scoreCall(updated);
        }
      } catch (e) {
        await db.agentLog.create({ data: { workspaceId: ws.id, agent: "Tổng đài", message: `Không xử lý được ghi âm: ${e instanceof Error ? e.message : e}` } });
      }
    })();
  }
  return ok({ ok: true, id: call.id, matched: !!contact });
}
