import { db, dbRaw } from "./db";

/** Số ngày giữ mục trong thùng rác trước khi tự xoá hẳn. */
export const TRASH_DAYS = 30;

/** Chuyển một mục vào thùng rác: ẩn mục và các việc gắn với nó (kịch bản chăm sóc đang chạy sẽ tự dừng). */
export async function moveToTrash(workspaceId: string, id: string, by: string) {
  await dbRaw.$transaction([
    dbRaw.record.updateMany({ where: { id, workspaceId, deletedAt: null }, data: { deletedAt: new Date(), deletedBy: by } }),
    dbRaw.task.updateMany({ where: { workspaceId, recordId: id }, data: { inTrash: true } }),
  ]);
}

/** Lấy mục ra khỏi thùng rác. Trả về false nếu mục không còn trong thùng rác. */
export async function restoreFromTrash(workspaceId: string, id: string) {
  const res = await dbRaw.record.updateMany({ where: { id, workspaceId, deletedAt: { not: null } }, data: { deletedAt: null, deletedBy: "" } });
  if (!res.count) return false;
  await dbRaw.task.updateMany({ where: { workspaceId, recordId: id }, data: { inTrash: false } });
  return true;
}

/** Xoá hẳn các mục trong thùng rác (cập nhật đi kèm tự xoá theo quan hệ). */
export async function purge(workspaceId: string, ids: string[]) {
  if (!ids.length) return 0;
  const rows = await dbRaw.record.findMany({ where: { workspaceId, id: { in: ids }, deletedAt: { not: null } }, select: { id: true } });
  const keep = rows.map((r) => r.id);
  if (!keep.length) return 0;
  await dbRaw.$transaction([dbRaw.task.deleteMany({ where: { workspaceId, recordId: { in: keep } } }), dbRaw.record.deleteMany({ where: { id: { in: keep } } })]);
  return keep.length;
}

/** Job: xoá hẳn mục đã nằm trong thùng rác quá TRASH_DAYS ngày. */
export async function purgeExpired(now = Date.now()) {
  const old = await dbRaw.record.findMany({ where: { deletedAt: { lt: new Date(now - TRASH_DAYS * 864e5) } }, select: { id: true, workspaceId: true }, take: 2000 });
  const byWs = new Map<string, string[]>();
  for (const r of old) byWs.set(r.workspaceId, [...(byWs.get(r.workspaceId) ?? []), r.id]);
  for (const [ws, ids] of byWs) await purge(ws, ids);
}

/** Danh sách mục trong thùng rác của workspace (mới xoá trước). */
export function listTrash(workspaceId: string, objectKey?: string) {
  return db.record.findMany({
    where: { workspaceId, deletedAt: { not: null }, ...(objectKey ? { objectKey } : {}) },
    orderBy: { deletedAt: "desc" },
    take: 500,
    select: { id: true, objectKey: true, title: true, status: true, ownerName: true, amount: true, deletedAt: true, deletedBy: true, createdAt: true },
  });
}
