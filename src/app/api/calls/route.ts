import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { OUTCOMES, outcomeOf, saveRecording, scoreCall, sttConfigured, transcribe } from "@/lib/calls";
import { normPhone } from "@/lib/sources/ingest";

const Body = z.object({
  recordId: z.string().optional(),
  phone: z.string().max(30).optional(),
  outcome: z.enum(OUTCOMES.map((o) => o.key) as [string, ...string[]]),
  durationSec: z.coerce.number().int().min(0).max(36000).default(0),
  note: z.string().max(4000).default(""),
  callbackAt: z.string().optional(),
  transcript: z.string().max(100000).default(""),
});

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const url = new URL(req.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  const recordId = url.searchParams.get("record") ?? undefined;
  const calls = await db.call.findMany({ where: { workspaceId: a.ctx.workspace.id, agentName: agent, recordId }, orderBy: { startedAt: "desc" }, take: 200 });
  return ok({ calls: calls.map(({ scoreJson, transcript, ...c }) => ({ ...c, hasTranscript: !!transcript, scored: !!scoreJson })) });
}

/** Ghi nhận cuộc gọi: lưu ghi âm, tự chép lời (nếu cấu hình STT), chấm điểm, tạo việc gọi lại. Nhận multipart (có file) hoặc JSON. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const ws = a.ctx.workspace;
  let fields: Record<string, unknown> = {};
  let file: File | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    const f = form.get("recording");
    if (f instanceof File && f.size) file = f;
  } else fields = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(fields);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const b = parsed.data;
  if (file && file.size > 60 * 1024 * 1024) return fail("File ghi âm tối đa 60MB");

  const rec = b.recordId ? await db.record.findFirst({ where: { id: b.recordId, workspaceId: ws.id } }) : null;
  const callbackAt = b.callbackAt ? new Date(b.callbackAt) : null;
  let call = await db.call.create({
    data: {
      workspaceId: ws.id,
      recordId: rec?.id,
      phone: normPhone(b.phone) || b.phone || "",
      agentName: a.ctx.user.name,
      outcome: b.outcome,
      durationSec: b.durationSec,
      note: b.note,
      callbackAt: callbackAt && !isNaN(+callbackAt) ? callbackAt : null,
      transcript: b.transcript,
    },
  });

  let sttError = "";
  if (file) {
    const { name, buf } = await saveRecording(call.id, file);
    call = await db.call.update({ where: { id: call.id }, data: { recordingPath: name } });
    if (!call.transcript && sttConfigured()) {
      try {
        const text = await transcribe(buf, file.name);
        if (text) call = await db.call.update({ where: { id: call.id }, data: { transcript: text } });
      } catch (e) {
        sttError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  if (rec) {
    const mins = Math.round(b.durationSec / 60);
    await db.activity.create({
      data: { recordId: rec.id, kind: "call", body: `Cuộc gọi${mins ? ` ${mins} phút` : ""}: ${outcomeOf(b.outcome).label}.${b.note ? ` ${b.note}` : ""}`, author: a.ctx.user.name },
    });
    await db.record.update({ where: { id: rec.id }, data: { updatedAt: new Date() } });
  }
  if (call.callbackAt) {
    await db.task.create({ data: { workspaceId: ws.id, recordId: rec?.id, title: `Gọi lại ${rec?.title ?? call.phone}`, dueAt: call.callbackAt, source: "Telesales" } });
  }
  const score = await scoreCall(call);
  return ok({ id: call.id, score, sttError, needsTranscript: !!file && !call.transcript }, 201);
}
