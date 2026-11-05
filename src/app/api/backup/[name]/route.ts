import fs from "node:fs/promises";
import { z } from "zod";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { backupPath, createBackup, restoreBackup } from "@/lib/backup";
import { ownerApi } from "../guard";

type P = { params: Promise<{ name: string }> };

/** Tải file sao lưu về máy. Tên file được kiểm tra theo mẫu nên không thể đọc file ngoài thư mục sao lưu. */
export async function GET(_req: Request, { params }: P) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const { name } = await params;
  const file = backupPath(decodeURIComponent(name), a.ctx.workspace.id);
  if (!file) return fail("Tên file không hợp lệ", 400);
  const buf = await fs.readFile(file).catch(() => null);
  if (!buf) return fail("Không tìm thấy bản sao lưu", 404);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "backup.download", "backup", name, `Tải về bản sao lưu ${name}`);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="dna-crm-${name}"`, "Cache-Control": "no-store" },
  });
}

const Body = z.object({ confirm: z.string() });

/** Khôi phục: phải gõ đúng tên workspace. Tự sao lưu bản hiện tại trước khi ghi đè. */
export async function POST(req: Request, { params }: P) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const { name } = await params;
  const file = backupPath(decodeURIComponent(name), ctx.workspace.id);
  if (!file) return fail("Tên file không hợp lệ", 400);
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success || body.data.confirm.trim() !== ctx.workspace.name.trim()) return fail("Tên workspace gõ chưa đúng, chưa khôi phục.");
  if (!(await fs.stat(file).catch(() => null))) return fail("Không tìm thấy bản sao lưu", 404);

  const safety = await createBackup(ctx.workspace.id);
  try {
    const r = await restoreBackup(file, ctx.workspace.id);
    const records = r.counts.record ?? 0;
    await audit(
      { workspaceId: ctx.workspace.id, user: ctx.user },
      "backup.restore",
      "backup",
      name,
      `Khôi phục từ ${name} (${records} mục${r.remapped ? `, từ workspace “${r.sourceWorkspace}”` : ""}). Bản trước khi khôi phục: ${safety.name}`,
      r.counts,
    );
    return ok({ ...r, safety: safety.name });
  } catch (e) {
    console.error("[backup] khôi phục lỗi:", e);
    return fail(`Khôi phục không thành công, dữ liệu giữ nguyên. ${e instanceof Error ? e.message.slice(0, 300) : ""}`, 500);
  }
}
