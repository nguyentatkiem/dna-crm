import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { firstError } from "@/lib/sales/schemas";
import { LayoutSchema, type DocType } from "@/lib/print/blocks";
import { setDefaultTemplate } from "@/lib/print/server";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({ name: z.string().trim().min(1, "Cần đặt tên mẫu").max(120).optional(), layout: LayoutSchema.optional(), isDefault: z.boolean().optional() });

async function guard(id: string) {
  const a = await appApi();
  if ("error" in a) return { error: a.error } as const;
  const wid = a.ctx.workspace.id;
  if (!allow(await getAccess(a.ctx.user.id, wid), "print_templates_manage")) return { error: fail("Bạn chưa có quyền sửa mẫu in", 403) } as const;
  const before = await db.printTemplate.findFirst({ where: { id, workspaceId: wid } });
  if (!before) return { error: fail("Không tìm thấy mẫu in", 404) } as const;
  return { a, before } as const;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  const wid = g.a.ctx.workspace.id;
  await db.printTemplate.update({ where: { id: g.before.id }, data: { ...(d.name ? { name: d.name } : {}), ...(d.layout ? { layoutJson: JSON.stringify(d.layout) } : {}) } });
  if (d.isDefault !== undefined) {
    if (d.isDefault) await setDefaultTemplate(wid, g.before.docType as DocType, g.before.id);
    else await db.printTemplate.update({ where: { id: g.before.id }, data: { isDefault: false } });
  }
  const what = [d.name && "tên", d.layout && "bố cục", d.isDefault !== undefined && (d.isDefault ? "đặt mặc định" : "bỏ mặc định")].filter(Boolean).join(", ");
  await audit({ workspaceId: wid, user: g.a.ctx.user }, "print_template.update", "print_template", g.before.id, `Sửa mẫu in “${d.name ?? g.before.name}”: ${what || "không đổi"}`);
  return ok(await db.printTemplate.findUnique({ where: { id: g.before.id } }));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  await db.printTemplate.delete({ where: { id: g.before.id } });
  await audit({ workspaceId: g.a.ctx.workspace.id, user: g.a.ctx.user }, "print_template.delete", "print_template", g.before.id, `Xoá mẫu in “${g.before.name}”`, { before: g.before });
  return ok({ deleted: true });
}
