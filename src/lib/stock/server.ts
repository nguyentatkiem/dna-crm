// Tồn kho phía server: ghi phát sinh (sổ kho có số dư chạy), trừ/hoàn kho theo đơn, cảnh báo sắp hết.
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counter";
import { getPref, setPref } from "@/lib/prefs";
import { membersWith } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { parseLines, type Line } from "@/lib/sales/lines";
import { STOCK_DEFAULT, fmtQty, isCommitted, isLow, moveQty, orderStockDelta, q3, shortages, type MoveKind, type StockPref, type StockVoucher } from "./shared";

type Actor = { id: string; name: string } | null;
export type MoveIn = { productId: string; qty: number; kind: MoveKind; orderId?: string | null; note?: string; by?: string };

export const stockPref = (wid: string) => getPref<StockPref>(wid, "stock", STOCK_DEFAULT);
export const saveStockPref = (wid: string, p: StockPref) => setPref(wid, "stock", { allowNegative: !!p.allowNegative, lowStockAlert: !!p.lowStockAlert });

/**
 * Ghi các phát sinh trong một giao dịch: cộng dồn Product.stock rồi lưu số dư sau ghi vào StockMove.balance.
 * Sản phẩm không thuộc workspace bị bỏ qua.
 */
export async function recordMoves(workspaceId: string, moves: MoveIn[]) {
  const list = moves.filter((m) => q3(m.qty) !== 0);
  if (!list.length) return [];
  return db.$transaction(async (tx) => {
    const out = [];
    for (const m of list) {
      const hit = await tx.product.updateMany({ where: { id: m.productId, workspaceId }, data: { stock: { increment: q3(m.qty) } } });
      if (!hit.count) continue;
      const p = await tx.product.findUniqueOrThrow({ where: { id: m.productId }, select: { stock: true } });
      // Chuẩn hoá số thực sau khi cộng.
      const bal = q3(p.stock);
      if (bal !== p.stock) await tx.product.update({ where: { id: m.productId }, data: { stock: bal } });
      out.push(await tx.stockMove.create({ data: { workspaceId, productId: m.productId, qty: q3(m.qty), kind: m.kind, orderId: m.orderId ?? null, note: (m.note ?? "").slice(0, 1000), balance: bal, by: m.by ?? "" } }));
    }
    return out;
  });
}

const PREFIX: Record<StockVoucher["kind"], string> = { in: "PN", out: "PX", adjust: "KK" };
const KIND_LABEL: Record<StockVoucher["kind"], string> = { in: "Phiếu nhập", out: "Phiếu xuất", adjust: "Phiếu kiểm kê" };

/**
 * Phiếu nhập / xuất / kiểm kê nhiều dòng. Kiểm kê: qty là số đếm được, ghi chênh lệch so với tồn.
 * Xuất quá tồn khi cấu hình không cho âm → lỗi.
 */
export async function applyVoucher(workspaceId: string, v: StockVoucher, actor: Actor): Promise<{ number: string; count: number } | { error: string }> {
  const ids = [...new Set(v.lines.map((l) => l.productId))];
  const products = await db.product.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true, stock: true, trackStock: true } });
  if (products.length !== ids.length) return { error: "Có sản phẩm không còn trong danh mục" };
  const untracked = products.filter((p) => !p.trackStock);
  if (untracked.length) return { error: `“${untracked[0].name}” chưa bật theo dõi tồn kho` };
  const pref = await stockPref(workspaceId);
  // Gộp các dòng trùng sản phẩm.
  const sum = new Map<string, number>();
  for (const l of v.lines) sum.set(l.productId, v.kind === "adjust" ? Number(l.qty) || 0 : q3((sum.get(l.productId) ?? 0) + Math.abs(Number(l.qty) || 0)));
  if (v.kind === "adjust" && [...sum.values()].some((x) => x < 0)) return { error: "Số đếm được không âm" };
  if (v.kind === "out" && !pref.allowNegative) {
    const short = products.find((p) => (sum.get(p.id) ?? 0) > p.stock);
    if (short) return { error: `Không đủ tồn: “${short.name}” còn ${fmtQty(short.stock)}` };
  }
  const number = await nextNumber(workspaceId, PREFIX[v.kind]);
  const note = [number, v.reason, v.note].filter(Boolean).join(" · ");
  const moves = products.map((p) => ({ productId: p.id, qty: moveQty(v.kind, sum.get(p.id) ?? 0, p.stock), kind: v.kind as MoveKind, note, by: actor?.name ?? "" }));
  const done = await recordMoves(workspaceId, moves);
  await audit({ workspaceId, user: actor }, `stock.${v.kind}`, "stock", number, `${KIND_LABEL[v.kind]} ${number}: ${done.length} sản phẩm${v.reason ? ` (${v.reason})` : ""}`);
  return { number, count: done.length };
}

/**
 * Đồng bộ kho của một đơn với trạng thái hiện tại (idempotent, gọi bao nhiêu lần cũng được):
 * đơn Đã xác nhận / Đang giao / Hoàn tất → trừ kho đúng một lần (kind "order");
 * đơn Mới / Đã huỷ / đã xoá → hoàn lại phần đã trừ (kind "return").
 * Chỉ tính các dòng gắn sản phẩm có bật theo dõi tồn.
 */
export async function syncOrderStock(workspaceId: string, orderId: string, actor?: Actor) {
  const order = await db.order.findFirst({ where: { id: orderId, workspaceId }, select: { id: true, number: true, status: true, itemsJson: true } });
  const moves = await db.stockMove.findMany({ where: { workspaceId, orderId, kind: { in: ["order", "return"] } }, select: { productId: true, qty: true, kind: true } });
  const lines = order ? parseLines(order.itemsJson) : [];
  const ids = [...new Set([...lines.map((l) => l.productId).filter((x): x is string => !!x), ...moves.map((m) => m.productId)])];
  if (!ids.length) return [];
  const tracked = new Set((await db.product.findMany({ where: { workspaceId, id: { in: ids }, trackStock: true }, select: { id: true } })).map((p) => p.id));
  // Sản phẩm đã trừ rồi mà sau đó tắt theo dõi vẫn được hoàn khi huỷ.
  for (const m of moves) tracked.add(m.productId);
  const delta = orderStockDelta(lines, moves, !!order && isCommitted(order.status), tracked);
  if (!delta.size) return [];
  const label = order ? `Đơn ${order.number}` : "Đơn đã xoá";
  return recordMoves(
    workspaceId,
    [...delta].map(([productId, qty]) => ({ productId, qty, kind: qty < 0 ? "order" : "return", orderId, note: qty < 0 ? `${label}: xuất kho` : `${label}: hoàn kho`, by: actor?.name ?? "Hệ thống" })),
  );
}

/** Dòng hàng thiếu tồn (cho cảnh báo / chặn xác nhận đơn khi không cho âm kho). */
export async function lineShortages(workspaceId: string, lines: Pick<Line, "productId" | "qty">[]) {
  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const products = await db.product.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true, stock: true, trackStock: true } });
  return shortages(lines, products);
}

/**
 * Trước khi đơn chuyển sang trạng thái giữ hàng: nếu không cho âm kho mà thiếu hàng → thông báo lỗi.
 * (Đơn đã trừ kho trước đó thì không kiểm lại.)
 */
export async function checkCommit(workspaceId: string, order: { id: string; status: string; itemsJson: string }, nextStatus: string): Promise<string | null> {
  if (!isCommitted(nextStatus) || isCommitted(order.status)) return null;
  const pref = await stockPref(workspaceId);
  if (pref.allowNegative) return null;
  const already = await db.stockMove.count({ where: { workspaceId, orderId: order.id, kind: "order" } });
  const short = await lineShortages(workspaceId, parseLines(order.itemsJson));
  if (!short.length || already) return null;
  const s = short[0];
  return `Không đủ tồn kho: “${s.name}” cần ${fmtQty(s.need)}, còn ${fmtQty(s.stock)}. Nhập thêm hàng hoặc bật “Cho bán âm kho”.`;
}

/** Cảnh báo sắp hết hàng (hằng ngày): báo người có quyền "Nhập, xuất, kiểm kho", mỗi sản phẩm tối đa 1 lần/ngày. */
export async function tickLowStock(): Promise<void> {
  const rows = await db.product.findMany({ where: { trackStock: true, active: true }, select: { id: true, workspaceId: true, name: true, stock: true, lowStock: true, trackStock: true, unit: true } });
  const low = rows.filter(isLow);
  const byWs = new Map<string, typeof low>();
  for (const p of low) byWs.set(p.workspaceId, [...(byWs.get(p.workspaceId) ?? []), p]);
  for (const [wid, items] of byWs) {
    const pref = await stockPref(wid);
    if (!pref.lowStockAlert) continue;
    const users = await membersWith(wid, "stock_manage");
    const text =
      items.length === 1
        ? `Sắp hết hàng: “${items[0].name}” còn ${fmtQty(items[0].stock)} ${items[0].unit}`
        : `${items.length} sản phẩm sắp hết hàng: ${items
            .slice(0, 3)
            .map((p) => `${p.name} (${fmtQty(p.stock)})`)
            .join(", ")}${items.length > 3 ? "…" : ""}`;
    // Chống trùng theo từng người (notifyOnce chỉ so theo workspace nên người thứ hai sẽ bị bỏ).
    const since = new Date(Date.now() - 20 * 3600e3);
    for (const userId of users) {
      const dup = await db.notification.findFirst({ where: { workspaceId: wid, userId, kind: "stock", text: text.slice(0, 300), createdAt: { gte: since } }, select: { id: true } });
      if (!dup) await notify(wid, { userId, kind: "stock", text, href: "/w/stock?low=1" });
    }
  }
}
