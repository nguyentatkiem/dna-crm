import type { Record as DbRecord } from "@prisma/client";
import { db, parseJson } from "../db";
import { getObject, type WorkspaceConfig } from "../config/schema";
import type { FieldValue, RecordDTO } from "../records";
import { loadCfg } from "../marketing/store";
import { applyFilters, filterFields, type Filter } from "@/components/board/model";

export type SegmentMode = "and" | "or";

/** Đọc bộ lọc đã lưu, bỏ điều kiện hỏng để không làm lỗi cả nhóm. */
export function parseFilters(json: string): Filter[] {
  const raw = parseJson<unknown>(json, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Filter => !!f && typeof f === "object" && typeof (f as Filter).field === "string" && typeof (f as Filter).op === "string")
    .map((f, i) => ({ id: String(f.id ?? i), field: f.field, op: f.op, value: String(f.value ?? "") }));
}

/** Giống toDTO của records.ts; viết lại để không kéo theo vòng import records → sequences → gửi hàng loạt. */
function dto(r: DbRecord): RecordDTO {
  return { id: r.id, objectKey: r.objectKey, title: r.title, status: r.status, ownerName: r.ownerName, amount: r.amount, score: r.score, winProb: r.winProb ?? null, data: parseJson<Record<string, FieldValue>>(r.dataJson, {}), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), updates: 0 };
}

/** Lọc các Record theo đúng logic Lọc nâng cao của bảng (chạy thuần, dùng được trong kiểm thử). */
export function filterRecords<T extends DbRecord>(cfg: WorkspaceConfig, objectKey: string, rows: T[], filters: Filter[], mode: SegmentMode): T[] {
  const obj = getObject(cfg, objectKey);
  if (!obj) return [];
  const dtos = rows.map(dto);
  const keep = new Set(applyFilters(dtos, filters, mode, filterFields(obj, cfg.team), obj).map((d) => d.id));
  return rows.filter((r) => keep.has(r.id));
}

/** Thành viên của một bộ lọc chưa lưu (xem trước khi tạo nhóm). */
export async function resolveFilters(workspaceId: string, objectKey: string, filters: Filter[], mode: SegmentMode, cfg?: WorkspaceConfig | null): Promise<DbRecord[]> {
  const c = cfg ?? (await loadCfg(workspaceId));
  if (!c || !getObject(c, objectKey)) return [];
  // db tự ẩn mục trong thùng rác.
  const rows = await db.record.findMany({ where: { workspaceId, objectKey }, orderBy: { updatedAt: "desc" } });
  return filterRecords(c, objectKey, rows, filters, mode);
}

/**
 * Lấy danh sách khách thuộc một nhóm khách động (bộ lọc đã lưu), áp đúng logic Lọc nâng cao của bảng.
 * Phần Chăm sóc hiện thực; Gửi hàng loạt dùng hàm này để chọn người nhận.
 */
export async function resolveSegment(workspaceId: string, segmentId: string): Promise<DbRecord[]> {
  const seg = await db.segment.findFirst({ where: { id: segmentId, workspaceId } });
  if (!seg) return [];
  return resolveFilters(workspaceId, seg.objectKey, parseFilters(seg.filtersJson), seg.mode === "or" ? "or" : "and");
}
