import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { allow, getAccess } from "@/lib/permissions";
import { firstError } from "@/lib/sales/schemas";
import { DOC_LABEL, DOC_TYPES, TemplateInput, builtinLayout, parseLayout, type DocType } from "@/lib/print/blocks";
import { setDefaultTemplate } from "@/lib/print/server";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const t = new URL(req.url).searchParams.get("docType") as DocType | null;
  const rows = await db.printTemplate.findMany({ where: { workspaceId: a.ctx.workspace.id, ...(t && DOC_TYPES.includes(t) ? { docType: t } : {}) }, orderBy: [{ docType: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }] });
  return ok({ items: rows });
}

/** Tạo mẫu mới (từ mẫu gốc, hoặc nhân bản fromId). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!allow(await getAccess(a.ctx.user.id, wid), "print_templates_manage")) return fail("Bạn chưa có quyền sửa mẫu in", 403);
  const p = TemplateInput.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  let layout = d.layout ?? builtinLayout(d.docType);
  if (d.fromId) {
    const src = await db.printTemplate.findFirst({ where: { id: d.fromId, workspaceId: wid } });
    if (!src) return fail("Không tìm thấy mẫu gốc", 404);
    layout = parseLayout(src.layoutJson, src.docType as DocType);
  }
  if ((await db.printTemplate.count({ where: { workspaceId: wid } })) >= 100) return fail("Tối đa 100 mẫu in mỗi workspace", 409);
  const row = await db.printTemplate.create({ data: { workspaceId: wid, docType: d.docType, name: d.name, layoutJson: JSON.stringify(layout), createdBy: a.ctx.user.name } });
  if (d.isDefault) await setDefaultTemplate(wid, d.docType, row.id);
  await audit({ workspaceId: wid, user: a.ctx.user }, "print_template.create", "print_template", row.id, `Tạo mẫu in ${DOC_LABEL[d.docType].toLowerCase()} “${row.name}”`);
  return ok(await db.printTemplate.findUnique({ where: { id: row.id } }), 201);
}
