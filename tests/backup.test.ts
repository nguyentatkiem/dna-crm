import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Chạy trên một file SQLite tạm trong thư mục tạm của hệ điều hành — KHÔNG đụng prisma/dev.db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dna-crm-backup-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;
process.env.BACKUP_DIR = path.join(tmp, "backups");

type Lib = typeof import("@/lib/backup");
let lib: Lib;
let db: (typeof import("@/lib/db"))["db"];
let ready = false;

beforeAll(async () => {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { env: { ...process.env }, stdio: "pipe", timeout: 90_000 });
    ready = true;
  } catch (e) {
    console.warn("Bỏ qua kiểm thử sao lưu: không tạo được database tạm.", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  lib = await import("@/lib/backup");
  db = (await import("@/lib/db")).db;
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("tên file sao lưu (chặn path traversal)", () => {
  it.each([
    ["2026-11-05_0930.json.gz", true],
    ["2026-11-05_0930-2.json.gz", true],
    ["../2026-11-05_0930.json.gz", false],
    ["..%2F..%2F.env", false],
    ["/etc/passwd", false],
    ["2026-11-05_0930.json", false],
    ["2026-11-05_0930.db", false],
    ["x/2026-11-05_0930.json.gz", false],
  ])("%s → %s", async (n, ok) => {
    const { isBackupName, backupPath } = await import("@/lib/backup");
    expect(isBackupName(n)).toBe(ok);
    expect(backupPath(n, "ws1") === null).toBe(!ok);
  });
  it("id workspace lạ bị từ chối", async () => {
    const { backupDir } = await import("@/lib/backup");
    expect(() => backupDir("../x")).toThrow();
  });
});

async function seed(name: string) {
  const ws = await db.workspace.create({ data: { name, settingsJson: JSON.stringify({ backup: { keep: "5" } }) } });
  const u = await db.user.create({ data: { email: `${name.replace(/\W/g, "")}@t.vn`, name, passwordHash: "x" } });
  await db.membership.create({ data: { userId: u.id, workspaceId: ws.id, role: "owner" } });
  await db.workspaceConfig.create({ data: { workspaceId: ws.id, version: 1, configJson: "{}", isActive: true } });
  const r1 = await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "Khách 1", status: "moi", dataJson: '{"sdt":"0912345678"}', activities: { create: [{ body: "Ghi chú 1", author: "A" }, { body: "Ghi chú 2", author: "B" }] } } });
  await db.record.create({ data: { workspaceId: ws.id, objectKey: "deals", title: "Đơn 1", status: "moi", amount: 1500000 } });
  await db.task.create({ data: { workspaceId: ws.id, recordId: r1.id, title: "Gọi lại", dueAt: new Date("2026-12-01T02:00:00Z") } });
  const conv = await db.conversation.create({ data: { workspaceId: ws.id, channel: "zalo", externalId: "u1", recordId: r1.id, name: "Khách 1" } });
  await db.message.create({ data: { conversationId: conv.id, direction: "in", text: "Xin chào" } });
  const seq = await db.sequence.create({ data: { workspaceId: ws.id, name: "Chăm sóc", triggerType: "record_created" } });
  await db.enrollment.create({ data: { sequenceId: seq.id, workspaceId: ws.id, recordId: r1.id, nextAt: new Date() } });
  return { ws, r1 };
}

const snapshot = async (wid: string) => ({
  records: (await db.record.findMany({ where: { workspaceId: wid }, orderBy: { title: "asc" }, include: { activities: { orderBy: { body: "asc" } } } })).map((r) => ({
    title: r.title,
    amount: r.amount,
    dataJson: r.dataJson,
    activities: r.activities.map((a) => a.body),
  })),
  tasks: (await db.task.findMany({ where: { workspaceId: wid } })).map((t) => [t.title, t.dueAt?.toISOString()]),
  messages: await db.message.count({ where: { conversation: { workspaceId: wid } } }),
  enrollments: await db.enrollment.count({ where: { workspaceId: wid } }),
});

describe("sao lưu → khôi phục trên SQLite tạm", () => {
  it("khôi phục đúng dữ liệu cũ trong cùng workspace", async () => {
    if (!ready) return;
    const { ws, r1 } = await seed("Spa Thử");
    const before = await snapshot(ws.id);
    const b = await lib.createBackup(ws.id);
    expect(lib.isBackupName(b.name)).toBe(true);
    expect(b.counts.record).toBe(2);

    // Làm bẩn: xoá khách, thêm rác, đổi cài đặt.
    await db.record.delete({ where: { id: r1.id } });
    await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "RÁC", status: "moi" } });
    await db.workspace.update({ where: { id: ws.id }, data: { settingsJson: "{}" } });

    const r = await lib.restoreBackup(b.path, ws.id);
    expect(r.remapped).toBe(false);
    expect(r.schemaMismatch).toBe(false);
    expect(await snapshot(ws.id)).toEqual(before);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).settingsJson).toContain('"keep":"5"');
    expect(await db.membership.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.record.findUnique({ where: { id: r1.id } })).not.toBeNull();
  }, 60_000);

  it("khôi phục sang workspace khác: id mới, liên kết giữ nguyên, workspace nguồn không đổi", async () => {
    if (!ready) return;
    const src = await db.workspace.findFirstOrThrow({ where: { name: "Spa Thử" } });
    const dst = await db.workspace.create({ data: { name: "Chi nhánh 2" } });
    const b = (await lib.listBackups(src.id))[0];
    const before = await snapshot(src.id);
    const r = await lib.restoreBackup(path.join(lib.backupDir(src.id), b.name), dst.id);
    expect(r.remapped).toBe(true);
    expect(await snapshot(dst.id)).toEqual(before);
    expect(await snapshot(src.id)).toEqual(before);
    const conv = await db.conversation.findFirstOrThrow({ where: { workspaceId: dst.id } });
    const rec = await db.record.findUniqueOrThrow({ where: { id: conv.recordId! } });
    expect(rec.workspaceId).toBe(dst.id);
  }, 60_000);

  it("sao lưu toàn hệ thống kèm bản sao file .db, giữ đúng số bản", async () => {
    if (!ready) return;
    const b = await lib.createBackup();
    expect(b.dbFile && fs.existsSync(b.dbFile)).toBe(true);
    const data = await lib.readBackup(b.path);
    expect(data.scope).toBe("all");
    expect(data.tables.workspace.length).toBe(2);
    for (let i = 0; i < 3; i++) await lib.createBackup();
    await lib.pruneBackups(undefined, 2);
    expect((await lib.listBackups()).length).toBe(2);
  }, 60_000);

  it("từ chối file không phải bản sao lưu", async () => {
    if (!lib) return;
    await expect(lib.readBackup(Buffer.from('{"hello":1}'))).rejects.toThrow(/không phải file sao lưu/);
    await expect(lib.readBackup(Buffer.from([0x1f, 0x8b, 1, 2, 3]))).rejects.toThrow(/hỏng/);
  });
});
