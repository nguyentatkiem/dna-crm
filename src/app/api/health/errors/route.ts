import { dbRaw as db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { healthApi } from "../guard";

// Lỗi của workspace này + lỗi hệ thống (không gắn workspace).
const scope = (wid: string) => ({ workspaceId: { in: [wid, ""] } });

/** Danh sách lỗi gần đây (mới nhất trước). ?all=1 gồm cả lỗi đã xử lý. */
export async function GET(req: Request) {
  const g = await healthApi();
  if ("error" in g) return g.error;
  const all = new URL(req.url).searchParams.get("all") === "1";
  const rows = await db.errorLog.findMany({ where: { ...scope(g.ctx.workspace.id), ...(all ? {} : { resolved: false }) }, orderBy: { lastAt: "desc" }, take: 100 });
  return ok({ errors: rows.map((r) => ({ id: r.id, level: r.level, message: r.message, stack: r.stack, path: r.path, count: r.count, firstAt: r.firstAt, lastAt: r.lastAt, resolved: r.resolved })) });
}

/** { id, resolved } đánh dấu đã xử lý / mở lại; { all: true } đánh dấu tất cả đã xử lý. */
export async function PATCH(req: Request) {
  const g = await healthApi();
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => ({}))) as { id?: string; resolved?: boolean; all?: boolean };
  const where = { ...scope(g.ctx.workspace.id), ...(b.all ? { resolved: false } : { id: String(b.id ?? "") }) };
  const r = await db.errorLog.updateMany({ where, data: { resolved: b.all ? true : b.resolved !== false } });
  if (!r.count && !b.all) return fail("Không tìm thấy lỗi", 404);
  return ok({ updated: r.count });
}

/** Chủ workspace: xoá các lỗi đã đánh dấu xử lý (hoặc { all: true } xoá hết). */
export async function DELETE(req: Request) {
  const g = await healthApi();
  if ("error" in g) return g.error;
  if (!g.acc.isOwner) return fail("Chỉ chủ workspace được xoá nhật ký lỗi", 403);
  const b = (await req.json().catch(() => ({}))) as { all?: boolean };
  const r = await db.errorLog.deleteMany({ where: { ...scope(g.ctx.workspace.id), ...(b.all ? {} : { resolved: true }) } });
  await audit({ workspaceId: g.ctx.workspace.id, user: g.ctx.user }, "health.clear_errors", "error_log", "", `Xoá ${r.count} dòng nhật ký lỗi`);
  return ok({ deleted: r.count });
}
