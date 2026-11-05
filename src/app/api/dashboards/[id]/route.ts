import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { parseWidgets } from "@/lib/dashboards";
import { Widget, computeDashboard, pack } from "@/lib/widgets";

type Ctx = { params: Promise<{ id: string }> };

/** Dashboard kèm dữ liệu từng widget đã tính theo quyền của người xem. */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const d = await db.dashboard.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!d) return fail("Không tìm thấy dashboard", 404);
  const widgets = parseWidgets(d.widgetsJson);
  const data = await computeDashboard(a.ctx, a.ctx.config, widgets);
  return ok({ id: d.id, name: d.name, isDefault: d.isDefault, updatedAt: d.updatedAt.toISOString(), widgets, data });
}

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isDefault: z.literal(true).optional(),
  widgets: z.array(Widget).max(40).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const wid = a.ctx.workspace.id;
  const d = await db.dashboard.findFirst({ where: { id, workspaceId: wid } });
  if (!d) return fail("Không tìm thấy dashboard", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu dashboard chưa hợp lệ");
  const p = parsed.data;
  if (p.isDefault) await db.dashboard.updateMany({ where: { workspaceId: wid, id: { not: id } }, data: { isDefault: false } });
  // Sắp lại toạ độ theo thứ tự để x/y luôn khớp lưới 12 cột.
  const widgets = p.widgets ? pack(p.widgets) : undefined;
  const row = await db.dashboard.update({
    where: { id },
    data: { name: p.name, isDefault: p.isDefault, widgetsJson: widgets ? JSON.stringify(widgets) : undefined },
  });
  const what = [p.name && p.name !== d.name ? `đổi tên thành “${p.name}”` : "", p.isDefault ? "đặt làm mặc định" : "", widgets ? `lưu ${widgets.length} widget` : ""].filter(Boolean).join(", ");
  await audit({ workspaceId: wid, user: a.ctx.user }, "update", "dashboard", id, `Dashboard “${d.name}”: ${what || "cập nhật"}`);
  return ok({ id: row.id, name: row.name, isDefault: row.isDefault, updatedAt: row.updatedAt.toISOString(), widgets: widgets ?? parseWidgets(row.widgetsJson) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const wid = a.ctx.workspace.id;
  const d = await db.dashboard.findFirst({ where: { id, workspaceId: wid } });
  if (!d) return fail("Không tìm thấy dashboard", 404);
  await db.dashboard.delete({ where: { id } });
  // Xoá dashboard mặc định thì chuyển mặc định sang dashboard cũ nhất còn lại.
  if (d.isDefault) {
    const next = await db.dashboard.findFirst({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } });
    if (next) await db.dashboard.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  await audit({ workspaceId: wid, user: a.ctx.user }, "delete", "dashboard", id, `Xoá dashboard “${d.name}”`);
  return ok({ deleted: true });
}
