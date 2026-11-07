import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database SQLite tạm — KHÔNG đụng prisma/dev.db.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dna-crm-stock-"));
process.env.DATABASE_URL = `file:${path.join(tmp, "test.db")}`;

type Db = typeof import("@/lib/db");
let D: Db;
let ready = false;

beforeAll(async () => {
  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", { env: { ...process.env }, stdio: "pipe", timeout: 90_000 });
    ready = true;
  } catch (e) {
    console.warn("Bỏ qua kiểm thử kho: không tạo được database tạm.", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  D = await import("@/lib/db");
}, 120_000);

afterAll(async () => {
  await D?.dbRaw.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("kho theo đơn hàng (database)", () => {
  it("xác nhận trừ một lần, huỷ hoàn một lần, số dư chạy đúng", async () => {
    if (!ready) return;
    const { db } = D;
    const { syncOrderStock, recordMoves, applyVoucher } = await import("@/lib/stock/server");
    const { createOrder } = await import("@/lib/sales/service");
    const ws = await db.workspace.create({ data: { name: "Kho thử" } });
    const p = await db.product.create({ data: { workspaceId: ws.id, name: "Serum", price: 100_000, trackStock: true } });
    const free = await db.product.create({ data: { workspaceId: ws.id, name: "Dịch vụ", price: 50_000 } });
    await recordMoves(ws.id, [{ productId: p.id, qty: 10, kind: "adjust", note: "Tồn đầu" }]);

    const { order, created } = await createOrder("system", {
      workspaceId: ws.id,
      customerName: "Khách",
      items: [
        { productId: p.id, code: "", name: "Serum", unit: "chai", qty: 3, price: 100_000, discountPct: 0, vatPct: 0 },
        { productId: free.id, code: "", name: "Dịch vụ", unit: "", qty: 1, price: 50_000, discountPct: 0, vatPct: 0 },
      ],
      salesChannel: "shopee",
      externalId: "SP-1",
      status: "confirmed",
    });
    expect(created).toBe(true);
    expect(order.total).toBe(350_000);
    // Tạo lại cùng mã sàn → trả đơn cũ.
    expect((await createOrder("system", { workspaceId: ws.id, customerName: "Khách", items: [], salesChannel: "shopee", externalId: "SP-1" })).created).toBe(false);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(7);
    // Gọi lại nhiều lần không trừ thêm.
    await syncOrderStock(ws.id, order.id);
    await syncOrderStock(ws.id, order.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(7);

    await db.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    await syncOrderStock(ws.id, order.id);
    await syncOrderStock(ws.id, order.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10);

    const r = await applyVoucher(ws.id, { kind: "adjust", reason: "Kiểm kê", note: "", lines: [{ productId: p.id, qty: 8 }] }, null);
    expect("number" in r && r.number.startsWith("KK-")).toBe(true);
    const moves = await db.stockMove.findMany({ where: { productId: p.id }, orderBy: { createdAt: "asc" } });
    expect(moves.map((m) => [m.kind, m.qty, m.balance])).toEqual([
      ["adjust", 10, 10],
      ["order", -3, 7],
      ["return", 3, 10],
      ["adjust", -2, 8],
    ]);
    // Sản phẩm không theo dõi tồn: không ghi phiếu, không cho nhập kho.
    expect(await db.stockMove.count({ where: { productId: free.id } })).toBe(0);
    expect(await applyVoucher(ws.id, { kind: "in", reason: "", note: "", lines: [{ productId: free.id, qty: 1 }] }, null)).toHaveProperty("error");
  });
});
