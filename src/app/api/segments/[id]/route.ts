import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getObject } from "@/lib/config/schema";
import { allowed } from "@/lib/permissions";
import { SegmentBody, members, scopedRows, segmentDTO } from "../shared";

type P = { params: Promise<{ id: string }> };

const find = (wid: string, id: string) => db.segment.findFirst({ where: { id, workspaceId: wid } });

/** Nhóm khách + 20 thành viên đầu. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await find(a.ctx.workspace.id, (await params).id);
  if (!s) return fail("Không tìm thấy nhóm khách", 404);
  const d = segmentDTO(s);
  return ok({ segment: d, ...members(a.ctx.config, s.objectKey, await scopedRows(a.ctx, s.objectKey), d.filters, d.mode) });
}

/** Sửa tên/bộ lọc: người tạo hoặc chủ/quản lý. */
export async function PATCH(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await find(a.ctx.workspace.id, (await params).id);
  if (!s) return fail("Không tìm thấy nhóm khách", 404);
  if (s.createdBy !== a.ctx.user.name && !(await allowed(a.ctx, "segment_manage"))) return fail("Chỉ người tạo hoặc người có quyền “Quản lý nhóm khách” sửa được nhóm này", 403);
  const p = SegmentBody.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  if (!getObject(a.ctx.config, p.data.objectKey)) return fail("Không có bảng này");
  const u = await db.segment.update({ where: { id: s.id }, data: { name: p.data.name, objectKey: p.data.objectKey, filtersJson: JSON.stringify(p.data.filters), mode: p.data.mode } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "segment.update", "segment", s.id, `Sửa nhóm khách “${u.name}”`, { before: { name: s.name, filters: s.filtersJson, mode: s.mode }, after: { name: u.name, filters: u.filtersJson, mode: u.mode } });
  return ok(segmentDTO(u));
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const s = await find(a.ctx.workspace.id, (await params).id);
  if (!s) return fail("Không tìm thấy nhóm khách", 404);
  if (s.createdBy !== a.ctx.user.name && !(await allowed(a.ctx, "segment_manage"))) return fail("Chỉ người tạo hoặc người có quyền “Quản lý nhóm khách” xoá được nhóm này", 403);
  // Chiến dịch gửi hàng loạt đang trỏ tới nhóm này thì không xoá, tránh gửi nhầm/không gửi.
  const used = await db.broadcast.count({ where: { workspaceId: a.ctx.workspace.id, segmentId: s.id, status: { in: ["draft", "scheduled", "sending"] } } }).catch(() => 0);
  if (used) return fail(`Nhóm đang được ${used} chiến dịch gửi hàng loạt dùng`, 409);
  await db.segment.delete({ where: { id: s.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "segment.delete", "segment", s.id, `Xoá nhóm khách “${s.name}”`);
  return ok({ ok: true });
}
