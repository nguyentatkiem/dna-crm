import { db } from "./db";

type Who = { workspaceId: string; user?: { id: string; name: string } | null };

/** Ghi nhật ký thao tác. Không bao giờ làm hỏng request chính nếu ghi lỗi. */
export async function audit(who: Who, action: string, entity: string, entityId: string, summary: string, diff?: unknown) {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: who.workspaceId,
        userId: who.user?.id ?? "",
        userName: who.user?.name ?? "Hệ thống",
        action,
        entity,
        entityId,
        summary: summary.slice(0, 500),
        diffJson: diff === undefined ? "" : JSON.stringify(diff).slice(0, 10000),
      },
    });
  } catch (e) {
    console.error("[audit]", e instanceof Error ? e.message : e);
  }
}

/** So sánh hai object phẳng, trả các trường đổi: { field: [cũ, mới] }. */
export function diffOf(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (after[k] === undefined) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = [before[k], after[k]];
  }
  return out;
}

/**
 * Ảnh chụp phẳng của một Record để so sánh trước/sau.
 * Các trường dữ liệu tách thành "data.<khoá>" để nhật ký chỉ ra đúng ô bị sửa.
 */
export function recordSnapshot(r: { title: string; status: string; ownerName: string; amount: number; dataJson: string }) {
  const out: Record<string, unknown> = { title: r.title, status: r.status, ownerName: r.ownerName, amount: r.amount };
  try {
    const d = JSON.parse(r.dataJson || "{}") as Record<string, unknown>;
    for (const [k, v] of Object.entries(d)) out[`data.${k}`] = v;
  } catch {}
  return out;
}

/** Như diffOf nhưng coi trường bị xoá (có trước, không còn sau) cũng là thay đổi. */
export function snapshotDiff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[k] ?? "";
    const b = after[k] ?? "";
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = [a, b];
  }
  return out;
}
