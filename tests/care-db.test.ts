import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database SQLite tạm trong thư mục tạm — KHÔNG đụng prisma/dev.db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dna-crm-care-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;

type Db = typeof import("@/lib/db");
let D: Db;
let ready = false;

const CFG = {
  businessName: "Thử",
  team: ["Lan"],
  objects: [{ key: "contacts", label: "Khách", itemLabel: "Khách", statusLabel: "Trạng thái", amountLabel: "", statuses: [{ key: "moi", label: "Mới", color: "blue" }, { key: "vip", label: "VIP", color: "purple" }], fields: [{ key: "sdt", label: "SĐT", type: "phone", options: [] }] }],
};

beforeAll(async () => {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { env: { ...process.env }, stdio: "pipe", timeout: 90_000 });
    ready = true;
  } catch (e) {
    console.warn("Bỏ qua kiểm thử Chăm sóc: không tạo được database tạm.", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  D = await import("@/lib/db");
}, 120_000);

afterAll(async () => {
  await D?.dbRaw.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function workspace() {
  const { dbRaw } = D;
  const ws = await dbRaw.workspace.create({ data: { name: "Thử" } });
  await dbRaw.workspaceConfig.create({ data: { workspaceId: ws.id, version: 1, configJson: JSON.stringify(CFG), isActive: true } });
  return ws;
}

describe("điểm nối đơn hàng → chăm sóc", () => {
  it("cộng điểm một lần mỗi đơn, ghi hoạt động", async () => {
    if (!ready) return;
    const { db } = D;
    const { awardPointsForOrder } = await import("@/lib/care/hooks");
    const ws = await workspace();
    const c = await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "Khách A", status: "moi", dataJson: '{"sdt":"0901234567"}' } });
    const order = { id: "o1", number: "DH-2026-0001", workspaceId: ws.id, contactId: c.id, customerName: "Khách A", customerPhone: "0901234567", total: 5_255_000, itemsJson: "[]", createdBy: "Lan" };
    expect(await awardPointsForOrder(order)).toBe(525);
    expect(await awardPointsForOrder(order)).toBe(0);
    expect(await awardPointsForOrder({ ...order, id: "o2", contactId: null })).toBe(0);
    const sum = await db.loyaltyTxn.aggregate({ where: { recordId: c.id }, _sum: { points: true } });
    expect(sum._sum.points).toBe(525);
    expect(await db.activity.count({ where: { recordId: c.id } })).toBe(1);
    // Lên hạng Bạc (≥ 500 điểm) thì có thông báo.
    expect(await db.notification.count({ where: { workspaceId: ws.id, kind: "loyalty" } })).toBe(1);
  });

  it("tạo phiếu bảo hành mỗi đơn vị, bỏ sản phẩm không bảo hành, không tạo lại", async () => {
    if (!ready) return;
    const { db } = D;
    const { createWarrantiesForOrder } = await import("@/lib/care/hooks");
    const ws = await workspace();
    const [p1, p2] = await Promise.all([
      db.product.create({ data: { workspaceId: ws.id, name: "Máy rửa mặt", warrantyMonths: 12 } }),
      db.product.create({ data: { workspaceId: ws.id, name: "Sữa rửa mặt", warrantyMonths: 0 } }),
    ]);
    const order = { id: "o9", number: "DH-2026-0009", workspaceId: ws.id, contactId: null, customerName: "Khách B", customerPhone: "+84 912 345 678", total: 1, createdBy: "Lan", itemsJson: JSON.stringify([{ productId: p1.id, qty: 2 }, { productId: p2.id, qty: 5 }, { name: "Hàng tự do", qty: 1 }]) };
    expect(await createWarrantiesForOrder(order)).toBe(2);
    expect(await createWarrantiesForOrder(order)).toBe(0);
    const ws2 = await db.warranty.findMany({ where: { workspaceId: ws.id } });
    expect(ws2.map((w) => w.phone)).toEqual(["0912345678", "0912345678"]);
    expect(ws2[0].endAt.getTime()).toBeGreaterThan(ws2[0].startAt.getTime() + 360 * 864e5);
  });
});

describe("nhóm khách và việc nền", () => {
  it("resolveSegment áp bộ lọc và bỏ mục trong thùng rác", async () => {
    if (!ready) return;
    const { db } = D;
    const { resolveSegment } = await import("@/lib/care/segments");
    const ws = await workspace();
    const a = await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "VIP 1", status: "vip" } });
    await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "VIP 2", status: "vip", deletedAt: new Date() } });
    await db.record.create({ data: { workspaceId: ws.id, objectKey: "contacts", title: "Mới", status: "moi" } });
    const seg = await db.segment.create({ data: { workspaceId: ws.id, name: "VIP", filtersJson: JSON.stringify([{ id: "1", field: "status", op: "is", value: "vip" }]) } });
    expect((await resolveSegment(ws.id, seg.id)).map((r) => r.id)).toEqual([a.id]);
    expect(await resolveSegment(ws.id, "khong-co")).toEqual([]);
    expect(await resolveSegment("ws-khac", seg.id)).toEqual([]);
  });

  it("phiếu quá hạn leo thang một lần; bảo hành nhắc trước và hết hạn", async () => {
    if (!ready) return;
    const { db, dbRaw } = D;
    const { tickTickets, tickWarranties } = await import("@/lib/care/jobs");
    const ws = await workspace();
    const u = await dbRaw.user.create({ data: { email: `care${Date.now()}@test.local`, name: "Lan", passwordHash: "x" } });
    await dbRaw.membership.create({ data: { userId: u.id, workspaceId: ws.id, role: "owner" } });
    const t = await db.ticket.create({ data: { workspaceId: ws.id, number: "TK-1", subject: "Lỗi", assignee: "Lan", dueAt: new Date(Date.now() - 3600e3) } });
    await db.ticket.create({ data: { workspaceId: ws.id, number: "TK-2", subject: "Xong rồi", status: "resolved", dueAt: new Date(Date.now() - 3600e3) } });
    expect(await tickTickets()).toBeGreaterThanOrEqual(1);
    expect((await db.ticket.findUnique({ where: { id: t.id } }))?.escalatedAt).not.toBeNull();
    // Người phụ trách cũng là chủ: chỉ một thông báo.
    expect(await db.notification.count({ where: { workspaceId: ws.id, kind: "ticket" } })).toBe(1);
    await tickTickets();
    expect(await db.notification.count({ where: { workspaceId: ws.id, kind: "ticket" } })).toBe(1);

    const now = Date.now();
    await db.warranty.createMany({
      data: [
        { workspaceId: ws.id, productName: "Sắp hết", startAt: new Date(now - 300 * 864e5), endAt: new Date(now + 20 * 864e5) },
        { workspaceId: ws.id, productName: "Đã hết", startAt: new Date(now - 400 * 864e5), endAt: new Date(now - 864e5) },
        { workspaceId: ws.id, productName: "Còn lâu", startAt: new Date(now), endAt: new Date(now + 200 * 864e5) },
      ],
    });
    const r = await tickWarranties();
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect((await db.warranty.findMany({ where: { workspaceId: ws.id }, orderBy: { productName: "asc" } })).map((w) => [w.productName, w.status, !!w.remindedAt])).toEqual([
      ["Còn lâu", "active", false],
      ["Sắp hết", "active", true],
      ["Đã hết", "expired", false],
    ]);
  });
});
