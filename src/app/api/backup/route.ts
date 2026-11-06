import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ok, fail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getSettings, saveSettings } from "@/lib/settings";
import { backupDir, createBackup, fmtSize, listBackups, pruneBackups, readBackup } from "@/lib/backup";
import { ownerApi } from "./guard";
import { viMessage } from "@/lib/format";

const keepOf = (v?: string) => Math.max(1, Math.min(365, Math.round(Number(v)) || 14));

/** Danh sách bản sao lưu của workspace + cài đặt tự động. */
export async function GET() {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const s = getSettings(a.ctx.workspace).backup;
  return ok({ backups: await listBackups(a.ctx.workspace.id), enabled: s?.enabled !== "0", keep: keepOf(s?.keep) });
}

/**
 * POST JSON {} → sao lưu ngay.
 * POST multipart file → tải lên một bản sao lưu (từ máy khác) để khôi phục sau.
 */
export async function POST(req: Request) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const { ctx } = a;
  const who = { workspaceId: ctx.workspace.id, user: ctx.user };

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const file = (await req.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) return fail("Chưa chọn file");
    if (file.size > 200 * 1024 * 1024) return fail("File quá lớn (tối đa 200 MB)");
    const buf = Buffer.from(await file.arrayBuffer());
    let info;
    try {
      info = await readBackup(buf);
    } catch (e) {
      return fail(viMessage(e, "File sao lưu không hợp lệ"));
    }
    const dir = backupDir(ctx.workspace.id);
    await fs.mkdir(dir, { recursive: true });
    const d = new Date(info.createdAt);
    const p = (n: number) => String(n).padStart(2, "0");
    const base = isNaN(d.getTime()) ? "2000-01-01_0000" : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    let name = `${base}.json.gz`;
    for (let i = 2; await fs.access(path.join(dir, name)).then(() => true, () => false); i++) name = `${base}-${i}.json.gz`;
    const { gzipSync } = await import("node:zlib");
    await fs.writeFile(path.join(dir, name), buf[0] === 0x1f && buf[1] === 0x8b ? buf : gzipSync(buf));
    await audit(who, "backup.upload", "backup", name, `Tải lên bản sao lưu ${file.name} → ${name}`);
    return ok({ name });
  }

  const b = await createBackup(ctx.workspace.id);
  const removed = await pruneBackups(ctx.workspace.id, keepOf(getSettings(ctx.workspace).backup?.keep));
  const records = b.counts.record ?? 0;
  await audit(who, "backup.create", "backup", b.name, `Sao lưu thủ công ${b.name} (${fmtSize(b.size)}, ${records} mục)${removed ? `, xoá ${removed} bản cũ` : ""}`);
  return ok({ name: b.name, size: b.size, counts: b.counts });
}

const Patch = z.object({ enabled: z.boolean().optional(), keep: z.number().int().min(1).max(365).optional() });

/** Bật/tắt sao lưu tự động, số bản giữ lại. */
export async function PUT(req: Request) {
  const a = await ownerApi();
  if ("error" in a) return a.error;
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Số bản giữ phải từ 1 đến 365");
  const patch: { enabled?: string; keep?: string } = {};
  if (p.data.enabled !== undefined) patch.enabled = p.data.enabled ? "1" : "0";
  if (p.data.keep !== undefined) patch.keep = String(p.data.keep);
  const next = await saveSettings(a.ctx.workspace.id, { backup: patch });
  await audit(
    { workspaceId: a.ctx.workspace.id, user: a.ctx.user },
    "update",
    "settings",
    "backup",
    `Sao lưu tự động: ${next.backup?.enabled === "0" ? "tắt" : "bật"}, giữ ${keepOf(next.backup?.keep)} bản`,
  );
  return ok({ enabled: next.backup?.enabled !== "0", keep: keepOf(next.backup?.keep) });
}
