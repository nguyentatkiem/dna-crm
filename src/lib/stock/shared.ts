// Tồn kho đơn giản: hằng số và hàm thuần (dùng được ở trình duyệt, máy chủ và kiểm thử).
import { z } from "zod";

/** Loại phiếu kho. in/out/adjust do người ghi; order/return do đơn hàng tự sinh. */
export type MoveKind = "in" | "out" | "adjust" | "order" | "return";
export const MOVE_KIND: Record<MoveKind, { label: string; tone: "success" | "warning" | "info" | "accent" | "neutral" }> = {
  in: { label: "Nhập kho", tone: "success" },
  out: { label: "Xuất kho", tone: "warning" },
  adjust: { label: "Kiểm kê", tone: "info" },
  order: { label: "Xuất theo đơn", tone: "accent" },
  return: { label: "Hoàn theo đơn huỷ", tone: "neutral" },
};

/** Cấu hình kho (Pref "stock"). */
export type StockPref = { allowNegative: boolean; lowStockAlert: boolean };
export const STOCK_DEFAULT: StockPref = { allowNegative: true, lowStockAlert: true };

/**
 * Trạng thái đơn đã "giữ hàng": vào một trong các trạng thái này thì trừ kho (đúng một lần),
 * huỷ thì hoàn lại. Đơn "Mới" chưa trừ kho (còn sửa được dòng hàng).
 */
export const COMMITTED_STATUSES = ["confirmed", "shipping", "done"] as const;
export const isCommitted = (status: string) => (COMMITTED_STATUSES as readonly string[]).includes(status);

/** Làm tròn số lượng 3 chữ số thập phân để tránh sai số cộng dồn số thực. */
export const q3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Số dư chạy: từ tồn đầu, cộng lần lượt từng phát sinh → mảng tồn sau mỗi dòng. */
export function runningBalance(opening: number, qtys: number[]): number[] {
  let b = q3(opening);
  return qtys.map((x) => (b = q3(b + (Number(x) || 0))));
}

/** Phát sinh của phiếu kho: nhập +, xuất −, kiểm kê = số đếm được − tồn hiện tại. */
export function moveQty(kind: "in" | "out" | "adjust", qty: number, current: number) {
  const v = Math.abs(Number(qty) || 0);
  if (kind === "in") return q3(v);
  if (kind === "out") return q3(-v);
  return q3((Number(qty) || 0) - current);
}

type LineLike = { productId?: string | null; qty: number };
type MoveLike = { productId: string; qty: number; kind: string };

/** Tổng số lượng theo sản phẩm của các dòng hàng (chỉ sản phẩm có theo dõi tồn). */
export function qtyByProduct(lines: LineLike[], tracked: Set<string>) {
  const m = new Map<string, number>();
  for (const l of lines) if (l.productId && tracked.has(l.productId)) m.set(l.productId, q3((m.get(l.productId) ?? 0) + (Number(l.qty) || 0)));
  return m;
}

/**
 * Phần kho cần ghi thêm để đơn khớp trạng thái (idempotent):
 * - đơn đã giữ hàng → tổng phát sinh của đơn cho mỗi sản phẩm phải bằng −SL;
 * - đơn chưa giữ / đã huỷ / đã xoá → tổng phải bằng 0.
 * So với các phiếu order/return đã ghi cho đơn, trả về chênh lệch cần ghi (âm = xuất, dương = hoàn).
 * Gọi nhiều lần liên tiếp chỉ ghi lần đầu.
 */
export function orderStockDelta(lines: LineLike[], moves: MoveLike[], committed: boolean, tracked: Set<string>): Map<string, number> {
  const want = committed ? qtyByProduct(lines, tracked) : new Map<string, number>();
  const have = new Map<string, number>();
  for (const mv of moves) if (mv.kind === "order" || mv.kind === "return") have.set(mv.productId, q3((have.get(mv.productId) ?? 0) + mv.qty));
  const out = new Map<string, number>();
  for (const id of new Set([...want.keys(), ...have.keys()])) {
    const delta = q3(-(want.get(id) ?? 0) - (have.get(id) ?? 0));
    if (delta) out.set(id, delta);
  }
  return out;
}

/** Sản phẩm thiếu hàng cho các dòng (theo tồn hiện tại). */
export function shortages(lines: LineLike[], products: { id: string; name: string; stock: number; trackStock: boolean }[]) {
  const tracked = new Set(products.filter((p) => p.trackStock).map((p) => p.id));
  const need = qtyByProduct(lines, tracked);
  return products.flatMap((p) => {
    const n = need.get(p.id) ?? 0;
    return n > p.stock ? [{ productId: p.id, name: p.name, need: n, stock: p.stock }] : [];
  });
}

/** Sắp hết: có theo dõi, có ngưỡng (>0) và tồn ≤ ngưỡng; hoặc đã âm. */
export const isLow = (p: { trackStock: boolean; stock: number; lowStock: number }) => p.trackStock && (p.stock < 0 || (p.lowStock > 0 && p.stock <= p.lowStock));

/** Giá trị tồn theo giá bán (chưa có giá vốn). Tồn âm không tính. */
export const stockValue = (p: { stock: number; price: number }) => Math.round(Math.max(0, p.stock) * (p.price || 0));

export const fmtQty = (n: number) => q3(n).toLocaleString("vi-VN", { maximumFractionDigits: 3 });

/** Phiếu nhập/xuất/kiểm kê gửi lên API. */
export const StockVoucherInput = z.object({
  kind: z.enum(["in", "out", "adjust"]),
  reason: z.string().trim().max(120).catch(""),
  note: z.string().trim().max(1000).catch(""),
  lines: z
    .array(z.object({ productId: z.string().min(1).max(60), qty: z.coerce.number().min(-1e9).max(1e9) }))
    .min(1, "Cần ít nhất một dòng")
    .max(300),
});
export type StockVoucher = z.infer<typeof StockVoucherInput>;

export const REASONS: Record<"in" | "out" | "adjust", string[]> = {
  in: ["Nhập hàng từ nhà cung cấp", "Khách trả hàng", "Chuyển kho đến", "Khác"],
  out: ["Xuất dùng nội bộ", "Hàng hỏng / hết hạn", "Tặng / dùng thử", "Chuyển kho đi", "Khác"],
  adjust: ["Kiểm kê định kỳ", "Điều chỉnh sai lệch", "Tồn đầu kỳ"],
};
