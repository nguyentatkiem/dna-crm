import { db } from "@/lib/db";
import { appApi } from "@/lib/http";
import { audit } from "@/lib/audit";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";
import { MOVE_KIND, isLow, stockValue, type MoveKind } from "@/lib/stock/shared";

/** Xuất Excel: sheet Tồn kho (sản phẩm có theo dõi) + sheet Sổ kho (tối đa 10.000 phát sinh gần nhất). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const products = await db.product.findMany({ where: { workspaceId: wid, trackStock: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  const moves = await db.stockMove.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "desc" }, take: 10000 });
  const name = new Map(products.map((p) => [p.id, p]));
  const others = [...new Set(moves.map((m) => m.productId).filter((id) => !name.has(id)))];
  if (others.length) for (const p of await db.product.findMany({ where: { workspaceId: wid, id: { in: others } } })) name.set(p.id, p);
  const buf = await buildXlsx([
    {
      name: "Tồn kho",
      columns: [
        { header: "Mã", kind: "text" },
        { header: "SKU", kind: "text" },
        { header: "Sản phẩm", kind: "text" },
        { header: "Nhóm", kind: "text" },
        { header: "ĐVT", kind: "text" },
        { header: "Tồn", kind: "number" },
        { header: "Ngưỡng sắp hết", kind: "number" },
        { header: "Giá bán", kind: "money" },
        { header: "Giá trị theo giá bán", kind: "money" },
        { header: "Trạng thái", kind: "text" },
      ],
      rows: products.map((p) => [p.code, p.sku, p.name, p.category, p.unit, p.stock, p.lowStock, p.price, stockValue(p), isLow(p) ? "Sắp hết" : "Đủ hàng"]),
    },
    {
      name: "Sổ kho",
      columns: [
        { header: "Thời gian", kind: "datetime" },
        { header: "Sản phẩm", kind: "text" },
        { header: "Loại", kind: "text" },
        { header: "Số lượng", kind: "number" },
        { header: "Tồn sau", kind: "number" },
        { header: "Diễn giải", kind: "text" },
        { header: "Người ghi", kind: "text" },
      ],
      rows: moves.map((m) => [m.createdAt, name.get(m.productId)?.name ?? "(đã xoá)", MOVE_KIND[m.kind as MoveKind]?.label ?? m.kind, m.qty, m.balance, m.note, m.by]),
    },
  ]);
  await audit({ workspaceId: wid, user: a.ctx.user }, "export", "stock", "", `Xuất Excel tồn kho (${products.length} sản phẩm, ${moves.length} phát sinh)`);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": XLSX_MIME, "Content-Disposition": `attachment; filename="ton-kho-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" },
  });
}
