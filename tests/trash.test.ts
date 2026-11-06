import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database SQLite tạm trong thư mục tạm — KHÔNG đụng prisma/dev.db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dna-crm-trash-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;

type Db = typeof import("@/lib/db");
type Trash = typeof import("@/lib/trash");
let D: Db;
let T: Trash;
let ready = false;

beforeAll(async () => {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { env: { ...process.env }, stdio: "pipe", timeout: 90_000 });
    ready = true;
  } catch (e) {
    console.warn("Bỏ qua kiểm thử thùng rác: không tạo được database tạm.", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  D = await import("@/lib/db");
  T = await import("@/lib/trash");
}, 120_000);

afterAll(async () => {
  await D?.dbRaw.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("thùng rác", () => {
  it("xoá mềm ẩn mục và việc, khôi phục đưa lại, xoá hẳn thì mất", async () => {
    if (!ready) return;
    const { db, dbRaw } = D;
    const ws = await dbRaw.workspace.create({ data: { name: "Thử" } });
    const rec = await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "Khách A", status: "new" } });
    await db.activity.create({ data: { recordId: rec.id, body: "Ghi chú", author: "Lan" } });
    await db.task.create({ data: { workspaceId: ws.id, recordId: rec.id, title: "Gọi lại" } });

    await T.moveToTrash(ws.id, rec.id, "Lan");
    expect(await db.record.count({ where: { workspaceId: ws.id } })).toBe(0);
    expect(await db.record.findUnique({ where: { id: rec.id } })).toBeNull();
    expect(await db.task.count({ where: { workspaceId: ws.id } })).toBe(0);
    const list = await T.listTrash(ws.id);
    expect(list.map((r) => [r.title, r.deletedBy])).toEqual([["Khách A", "Lan"]]);

    expect(await T.restoreFromTrash(ws.id, rec.id)).toBe(true);
    expect(await db.record.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await db.task.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await T.restoreFromTrash(ws.id, rec.id)).toBe(false);

    // Không xoá hẳn được mục chưa vào thùng rác.
    expect(await T.purge(ws.id, [rec.id])).toBe(0);
    await T.moveToTrash(ws.id, rec.id, "Lan");
    expect(await T.purge(ws.id, [rec.id])).toBe(1);
    expect(await dbRaw.record.count({ where: { id: rec.id } })).toBe(0);
    expect(await dbRaw.activity.count({ where: { recordId: rec.id } })).toBe(0);
    expect(await dbRaw.task.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it("tự xoá hẳn mục quá 30 ngày", async () => {
    if (!ready) return;
    const { db, dbRaw } = D;
    const ws = await dbRaw.workspace.create({ data: { name: "Thử 2" } });
    const oldRec = await db.record.create({ data: { workspaceId: ws.id, objectKey: "deals", title: "Cũ", status: "new" } });
    const newRec = await db.record.create({ data: { workspaceId: ws.id, objectKey: "deals", title: "Mới", status: "new" } });
    await T.moveToTrash(ws.id, oldRec.id, "Lan");
    await T.moveToTrash(ws.id, newRec.id, "Lan");
    await dbRaw.record.update({ where: { id: oldRec.id }, data: { deletedAt: new Date(Date.now() - 31 * 864e5) } });
    await T.purgeExpired();
    expect((await T.listTrash(ws.id)).map((r) => r.title)).toEqual(["Mới"]);
  });
});

describe("@nhắc tên gửi thông báo", () => {
  it("báo cho thành viên được nhắc, không báo cho chính người viết", async () => {
    if (!ready) return;
    const { dbRaw } = D;
    const { notifyMentions } = await import("@/lib/mentions");
    const ws = await dbRaw.workspace.create({ data: { name: "Thử 3" } });
    const [a, b] = await Promise.all([
      dbRaw.user.create({ data: { email: `a${Date.now()}@test.local`, name: "Chủ Demo", passwordHash: "x" } }),
      dbRaw.user.create({ data: { email: `b${Date.now()}@test.local`, name: "Minh Đức", passwordHash: "x" } }),
    ]);
    await dbRaw.membership.createMany({ data: [{ userId: a.id, workspaceId: ws.id, role: "owner" }, { userId: b.id, workspaceId: ws.id, role: "member" }] });
    const done = await notifyMentions(ws.id, { id: a.id, name: a.name }, "@Minh Đức gọi lại khách giúp mình, cc @Chủ Demo", { title: "Khách A", href: "/w/b/contacts?open=x" });
    expect(done).toEqual(["Minh Đức"]);
    const ns = await dbRaw.notification.findMany({ where: { workspaceId: ws.id } });
    expect(ns.map((n) => [n.userId, n.kind, n.href])).toEqual([[b.id, "mention", "/w/b/contacts?open=x"]]);
    expect(ns[0].text).toContain("Chủ Demo nhắc bạn trong “Khách A”");
  });
});
