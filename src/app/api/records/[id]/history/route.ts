import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { findScopedRecord, getRole } from "@/lib/permissions";
import { getFieldRules, hiddenKeys } from "@/lib/field-access";

/** Bỏ "data.<trường ẩn>" khỏi diff (kể cả trong before/after) để lịch sử không lộ trường bị ẩn. */
function stripHidden(diff: unknown, hide: Set<string>): unknown {
  if (!hide.size || !diff || typeof diff !== "object" || Array.isArray(diff)) return diff;
  return Object.fromEntries(
    Object.entries(diff as Record<string, unknown>)
      .filter(([k]) => !(k.startsWith("data.") && hide.has(k.slice(5))))
      .map(([k, v]) => [k, k === "before" || k === "after" ? stripHidden(v, hide) : v]),
  );
}

type Ctx = { params: Promise<{ id: string }> };

/** Lịch sử thay đổi từng ô của một mục (lấy từ nhật ký thao tác), mới nhất trước. */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const rec = await findScopedRecord(a.ctx, id);
  if (!rec) return fail("Không tìm thấy mục", 404);
  const [role, rules] = await Promise.all([getRole(a.ctx.user.id, a.ctx.workspace.id), getFieldRules(a.ctx.workspace.id, rec.objectKey)]);
  const hide = hiddenKeys(role, rules);
  const rows = await db.auditLog.findMany({
    where: { workspaceId: a.ctx.workspace.id, entityId: id, action: { in: ["record.create", "record.update"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok({
    entries: rows.map((r) => {
      let diff: unknown = null;
      try {
        diff = r.diffJson ? JSON.parse(r.diffJson) : null;
      } catch {}
      return { id: r.id, action: r.action, userName: r.userName, summary: r.summary, createdAt: r.createdAt.toISOString(), diff: stripHidden(diff, hide) };
    }),
  });
}
