// Dạng xem đã lưu của bảng (BoardView.stateJson). Dùng chung trình duyệt và server, không import db.
import { z } from "zod";

const Filter = z.object({ id: z.string().max(20), field: z.string().max(80), op: z.string().max(20), value: z.string().max(200) });
const ColorRule = z.object({ id: z.string().max(20), field: z.string().max(80), value: z.string().max(200), color: z.string().max(20) });

export const BoardState = z.object({
  view: z.enum(["table", "kanban", "calendar", "gantt", "chart"]).optional(),
  hidden: z.array(z.string().max(100)).max(200).optional(),
  /** Thứ tự cột (id cột); cột mới chưa có trong danh sách nằm cuối theo thứ tự mặc định. */
  order: z.array(z.string().max(100)).max(200).optional(),
  /** Độ rộng cột tự chỉnh (px). */
  widths: z.record(z.string().max(100), z.number().min(60).max(800)).optional(),
  filters: z.array(Filter).max(30).optional(),
  mode: z.enum(["and", "or"]).optional(),
  groupBy: z.string().max(100).optional(),
  sort: z.string().max(20).optional(),
  colSort: z.object({ col: z.string().max(100), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
  density: z.enum(["compact", "normal", "roomy"]).optional(),
  colorRules: z.array(ColorRule).max(20).optional(),
  owner: z.string().max(80).optional(),
  q: z.string().max(200).optional(),
});
export type BoardState = z.infer<typeof BoardState>;

export const ViewInput = z.object({
  objectKey: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Hãy đặt tên dạng xem").max(60),
  shared: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  state: BoardState,
});
export const ViewPatch = z.object({ name: z.string().trim().min(1).max(60).optional(), shared: z.boolean().optional(), isDefault: z.boolean().optional(), state: BoardState.optional() });

/** Dạng xem gửi cho trình duyệt. */
export type ViewDTO = { id: string; name: string; ownerName: string; mine: boolean; shared: boolean; isDefault: boolean; canEdit: boolean; state: BoardState; updatedAt: string };

/** Đọc stateJson an toàn: phần nào sai thì bỏ phần đó, không làm hỏng cả dạng xem. */
export function parseState(json: string): BoardState {
  let raw: unknown = {};
  try {
    raw = JSON.parse(json || "{}");
  } catch {
    return {};
  }
  const full = BoardState.safeParse(raw);
  if (full.success) return full.data;
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const sh = (BoardState.shape as Record<string, z.ZodType>)[k];
      if (sh && sh.safeParse(v).success) out[k] = v;
    }
  }
  return out as BoardState;
}

/** Ai sửa/xoá được một dạng xem: chủ của nó; dạng xem chia sẻ thì thêm chủ workspace và quản lý. */
export const canEditView = (v: { ownerId: string; shared: boolean }, userId: string, role: string) => v.ownerId === userId || (v.shared && (role === "owner" || role === "manager"));

/** Sắp cột theo thứ tự đã lưu + áp độ rộng tự chỉnh. Cột lạ trong order bị bỏ qua. */
export function arrangeColumns<C extends { id: string; w: number }>(cols: C[], order?: string[], widths?: Record<string, number>): C[] {
  const pos = new Map((order ?? []).map((id, i) => [id, i]));
  const sorted = order?.length ? [...cols].sort((a, b) => (pos.get(a.id) ?? 1e6 + cols.indexOf(a)) - (pos.get(b.id) ?? 1e6 + cols.indexOf(b))) : cols;
  return widths ? sorted.map((c) => (widths[c.id] ? { ...c, w: widths[c.id] } : c)) : sorted;
}

/** Di chuyển cột `from` tới vị trí của `to` (kéo thả tiêu đề cột). Trả thứ tự id đầy đủ. */
export function moveColumn(ids: string[], from: string, to: string): string[] {
  const i = ids.indexOf(from);
  const j = ids.indexOf(to);
  if (i < 0 || j < 0 || i === j) return ids;
  const next = [...ids];
  next.splice(i, 1);
  next.splice(j, 0, from);
  return next;
}

/** So sánh hai trạng thái (bỏ khoá rỗng) để biết dạng xem có thay đổi chưa lưu. */
export function sameState(a: BoardState, b: BoardState) {
  const norm = (s: BoardState) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(s)
          .filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length))
          .sort(([x], [y]) => x.localeCompare(y)),
      ),
    );
  return norm(a) === norm(b);
}
