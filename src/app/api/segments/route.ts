import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getObject } from "@/lib/config/schema";
import { filterRecords } from "@/lib/care/segments";
import { SegmentBody, scopedRows, segmentDTO } from "./shared";

/** Danh sách nhóm khách kèm số thành viên hiện tại (tính trực tiếp, không lưu sẵn). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const segs = await db.segment.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: { createdAt: "desc" } });
  const cache = new Map<string, Awaited<ReturnType<typeof scopedRows>>>();
  const items = [];
  for (const s of segs) {
    const d = segmentDTO(s);
    if (!cache.has(s.objectKey)) cache.set(s.objectKey, await scopedRows(a.ctx, s.objectKey));
    items.push({ ...d, count: filterRecords(a.ctx.config, s.objectKey, cache.get(s.objectKey)!, d.filters, d.mode).length });
  }
  return ok({ items });
}

/** Lưu bộ lọc thành nhóm khách. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = SegmentBody.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (!getObject(a.ctx.config, p.data.objectKey)) return fail("Không có bảng này");
  const s = await db.segment.create({ data: { workspaceId: a.ctx.workspace.id, name: p.data.name, objectKey: p.data.objectKey, filtersJson: JSON.stringify(p.data.filters), mode: p.data.mode, createdBy: a.ctx.user.name } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "segment.create", "segment", s.id, `Tạo nhóm khách “${s.name}”`);
  return ok(segmentDTO(s), 201);
}
