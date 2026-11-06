import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { appApi, fail } from "@/lib/http";
import { callScope } from "@/lib/permissions";
import { UPLOAD_DIR } from "@/lib/calls";

const TYPES: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", aac: "audio/aac", amr: "audio/amr" };

/** Phát ghi âm: chỉ thành viên workspace nghe được, file không nằm trong thư mục public. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const call = await db.call.findFirst({ where: { AND: [await callScope(a.ctx), { id }] } });
  if (!call?.recordingPath) return fail("Cuộc gọi không có ghi âm", 404);
  const file = path.join(UPLOAD_DIR, path.basename(call.recordingPath));
  const buf = await fs.readFile(file).catch(() => null);
  if (!buf) return fail("Không tìm thấy file ghi âm", 404);
  const ext = path.extname(file).slice(1);
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
