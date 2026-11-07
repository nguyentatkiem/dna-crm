// Dữ liệu mẫu cho Kho, Bảng giá theo hạng và Mẫu in. Idempotent: chạy lại không nhân đôi.
import { db } from "@/lib/db";
import { builtinLayout, newBlock, type Block } from "@/lib/print/blocks";
import { recordMoves } from "./server";

/** Sản phẩm vật lý: nhóm Mỹ phẩm (hoặc có tên dạng ml/g/hộp/chai). */
const PHYSICAL = /mỹ phẩm|serum|kem|sữa|mặt nạ|\d+ ?(ml|g)\b|hộp|chai|tuýp/i;

const EXTRA = [
  { code: "SRM150", sku: "SRM-150-DN", name: "Sữa rửa mặt dịu nhẹ 150ml", unit: "chai", category: "Mỹ phẩm", price: 320_000, vat: 10, weightGram: 200, opening: 40, lowStock: 10 },
  { code: "MN05", sku: "MN-CA-05", name: "Mặt nạ cấp ẩm (hộp 5 miếng)", unit: "hộp", category: "Mỹ phẩm", price: 250_000, vat: 10, weightGram: 150, opening: 2, lowStock: 5 },
];
const KNOWN: Record<string, { sku: string; weightGram: number; opening: number; lowStock: number }> = {
  "SR-C": { sku: "SRC-30-VC", weightGram: 120, opening: 24, lowStock: 6 },
  KCN50: { sku: "KCN-50-SPF", weightGram: 80, opening: 3, lowStock: 5 },
};

export async function seedStock(workspaceId: string) {
  const out = { tracked: 0, created: 0, moves: 0, rules: 0, templates: 0 };
  const hasMoves = (await db.stockMove.count({ where: { workspaceId } })) > 0;

  // 1) Bật theo dõi tồn cho hàng vật lý + thêm 2 mặt hàng.
  for (const e of EXTRA) {
    const ex = await db.product.findFirst({ where: { workspaceId, code: e.code } });
    if (!ex) {
      await db.product.create({ data: { workspaceId, code: e.code, sku: e.sku, name: e.name, unit: e.unit, category: e.category, price: e.price, vat: e.vat, weightGram: e.weightGram, lowStock: e.lowStock, trackStock: true, description: "" } });
      out.created++;
    }
  }
  const products = await db.product.findMany({ where: { workspaceId } });
  const physical = products.filter((p) => p.category === "Mỹ phẩm" || PHYSICAL.test(p.name));
  for (const p of physical) {
    const k = KNOWN[p.code] ?? EXTRA.find((e) => e.code === p.code);
    if (!p.trackStock || (k && (!p.sku || !p.weightGram))) {
      await db.product.update({ where: { id: p.id }, data: { trackStock: true, ...(k ? { sku: p.sku || k.sku, weightGram: p.weightGram || k.weightGram, lowStock: p.lowStock || k.lowStock } : { lowStock: p.lowStock || 5 }) } });
    }
    out.tracked++;
  }

  // 2) Tồn đầu kỳ + một phiếu nhập, chỉ lần đầu.
  if (!hasMoves) {
    const opening = physical.map((p) => ({ productId: p.id, qty: (KNOWN[p.code] ?? EXTRA.find((e) => e.code === p.code))?.opening ?? 20, kind: "adjust" as const, note: "KK-mẫu · Tồn đầu kỳ", by: "Hệ thống" }));
    out.moves += (await recordMoves(workspaceId, opening)).length;
    const src = physical.find((p) => p.code === "SR-C") ?? physical[0];
    if (src) out.moves += (await recordMoves(workspaceId, [{ productId: src.id, qty: 12, kind: "in", note: "PN-mẫu · Nhập hàng từ nhà cung cấp", by: "Hệ thống" }])).length;
  }

  // 3) Hai quy tắc giá theo hạng.
  if (!(await db.priceRule.count({ where: { workspaceId } }))) {
    const csd = products.find((p) => p.code === "CSD10");
    await db.priceRule.create({ data: { workspaceId, tier: "Vàng", category: "Mỹ phẩm", discountPct: 10 } });
    out.rules++;
    if (csd) {
      await db.priceRule.create({ data: { workspaceId, tier: "Kim cương", productId: csd.id, price: Math.round(csd.price * 0.85 / 1000) * 1000 } });
      out.rules++;
    }
  }

  // 4) Một mẫu in tuỳ biến (không đặt mặc định để trang in vẫn như cũ).
  if (!(await db.printTemplate.count({ where: { workspaceId } }))) {
    const base = builtinLayout("order");
    const layout: Block[] = [
      { ...base[0], align: "center" },
      { ...base[1], align: "center", opts: { text: "Phiếu giao hàng", number: true, date: true } },
      base[2],
      newBlock("items", { colVat: false, colDiscount: false, colUnit: true, subLine: false }),
      newBlock("totals", { words: true, paid: true }),
      newBlock("qr", { size: 130, info: true }, { align: "right" }),
      newBlock("text", { title: "", text: "Cảm ơn {ten_khach} đã tin dùng sản phẩm! Đơn {so_chung_tu} — tổng {tong_tien}. Mọi thắc mắc vui lòng gọi hotline in trên đầu phiếu." }, { size: "sm", align: "center" }),
      newBlock("signatures", { left: "Người nhận hàng", right: "Người giao hàng", seller: false }),
    ];
    await db.printTemplate.create({ data: { workspaceId, docType: "order", name: "Phiếu giao hàng (có QR)", layoutJson: JSON.stringify(layout), createdBy: "Hệ thống" } });
    out.templates++;
  }
  return out;
}
