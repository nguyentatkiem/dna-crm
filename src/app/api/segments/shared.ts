import type { Record as DbRecord, Segment } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordScope } from "@/lib/permissions";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { contactCard, type CareCtx } from "@/lib/care/server";
import { filterRecords, parseFilters } from "@/lib/care/segments";
import type { Filter } from "@/components/board/model";

export const FilterZ = z.object({ id: z.string().max(40), field: z.string().max(80), op: z.enum(["contains", "not_contains", "is", "is_not", "eq", "neq", "gt", "gte", "lt", "lte", "before", "after", "on", "empty", "not_empty"]), value: z.string().max(500) });
export const SegmentBody = z.object({ name: z.string().trim().min(1, "Đặt tên nhóm").max(80), objectKey: z.string().max(40), filters: z.array(FilterZ).max(30), mode: z.enum(["and", "or"]) });

/** Mục của một bảng mà người dùng thấy được (theo quyền), dùng cho đếm và xem trước trên giao diện. */
export async function scopedRows(ctx: CareCtx, objectKey: string) {
  const scope = await recordScope(ctx);
  return db.record.findMany({ where: { ...scope, objectKey }, orderBy: { updatedAt: "desc" } });
}

export function members(cfg: WorkspaceConfig, objectKey: string, rows: DbRecord[], filters: Filter[], mode: "and" | "or") {
  const hit = filterRecords(cfg, objectKey, rows, filters, mode);
  const obj = getObject(cfg, objectKey);
  return {
    total: hit.length,
    members: hit.slice(0, 20).map((r) => {
      const c = contactCard(cfg, r);
      return { id: r.id, title: r.title, phone: c.phone, owner: r.ownerName, status: obj?.statuses.find((s) => s.key === r.status)?.label ?? r.status };
    }),
  };
}

export const segmentDTO = (s: Segment) => ({ id: s.id, name: s.name, objectKey: s.objectKey, filters: parseFilters(s.filtersJson), mode: (s.mode === "or" ? "or" : "and") as "and" | "or", createdBy: s.createdBy, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() });
