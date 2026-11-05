import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { generateDashboard, parseWidgets } from "@/lib/dashboards";
import { TEMPLATES, buildWidgets, newId } from "@/lib/widgets";

export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rows = await db.dashboard.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return ok(rows.map((d) => ({ id: d.id, name: d.name, isDefault: d.isDefault, widgets: parseWidgets(d.widgetsJson).length, updatedAt: d.updatedAt.toISOString() })));
}

const Body = z.object({
  name: z.string().trim().max(80).optional(),
  template: z.enum(["blank", "sales", "telesales", "marketing"]).optional(),
  prompt: z.string().trim().min(3).max(500).optional(),
  duplicateOf: z.string().optional(),
});

/** Tạo dashboard: trống, từ mẫu, nhân bản, hoặc AI tạo theo mô tả. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const p = parsed.data;
  const wid = a.ctx.workspace.id;
  let name = p.name || "Dashboard mới";
  let widgets = buildWidgets([]);
  let source = "manual";
  if (p.duplicateOf) {
    const src = await db.dashboard.findFirst({ where: { id: p.duplicateOf, workspaceId: wid } });
    if (!src) return fail("Không tìm thấy dashboard", 404);
    name = p.name || `${src.name} (bản sao)`;
    widgets = parseWidgets(src.widgetsJson).map((w) => ({ ...w, id: newId() }));
    source = "duplicate";
  } else if (p.prompt) {
    const g = await generateDashboard(p.prompt, a.ctx.config);
    name = p.name || g.name;
    widgets = g.widgets;
    source = g.source;
  } else if (p.template && p.template !== "blank") {
    const t = TEMPLATES.find((x) => x.key === p.template)!;
    name = p.name || t.name;
    widgets = buildWidgets(t.widgets);
    source = "template";
  }
  const isFirst = (await db.dashboard.count({ where: { workspaceId: wid } })) === 0;
  const row = await db.dashboard.create({ data: { workspaceId: wid, name, isDefault: isFirst, widgetsJson: JSON.stringify(widgets) } });
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "dashboard", row.id, `Tạo dashboard “${name}”${source === "ai" ? " bằng AI" : source === "template" ? " từ mẫu" : source === "duplicate" ? " (nhân bản)" : ""}`);
  return ok({ id: row.id, name: row.name, isDefault: row.isDefault, widgets: widgets.length, updatedAt: row.updatedAt.toISOString(), source }, 201);
}
