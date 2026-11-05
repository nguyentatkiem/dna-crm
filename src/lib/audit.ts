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
