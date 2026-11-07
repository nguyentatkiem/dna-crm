import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { canManageReports, memberNames, toDTO, visibleReportsWhere } from "@/lib/reports/service";
import { reportTemplates } from "@/lib/reports/templates";
import { validateConfig } from "@/lib/reports/shared";
import { ReportBody } from "./body";

/** Báo cáo của tôi + báo cáo được chia sẻ, kèm mẫu dựng sẵn. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rows = await db.report.findMany({ where: visibleReportsWhere(a.ctx), orderBy: { updatedAt: "desc" }, take: 300 });
  const { names } = await memberNames(a.ctx.workspace.id);
  const items = await Promise.all(rows.map((r) => toDTO(a.ctx, r, a.ctx.config, names)));
  return ok({ items, canManage: await canManageReports(a.ctx), templates: reportTemplates(a.ctx.config) });
}

/** Tạo báo cáo: { name, config, ... } | { template } | { duplicateOf }. Cần quyền "Báo cáo tự tạo". */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await canManageReports(a.ctx))) return fail("Bạn chưa có quyền tạo báo cáo", 403);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const wid = a.ctx.workspace.id;

  let input: unknown = body;
  if (typeof body.duplicateOf === "string") {
    const src = await db.report.findFirst({ where: { AND: [visibleReportsWhere(a.ctx), { id: body.duplicateOf }] } });
    if (!src) return fail("Không tìm thấy báo cáo", 404);
    input = { name: `${src.name} (bản sao)`.slice(0, 120), config: JSON.parse(src.configJson || "{}") };
  } else if (typeof body.template === "string") {
    const t = reportTemplates(a.ctx.config).find((x) => x.key === body.template);
    if (!t) return fail("Không có mẫu này", 404);
    input = { name: t.name, config: t.config };
  }
  const p = ReportBody.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const v = validateConfig(p.data.config, a.ctx.config);
  if (!v.ok) return fail(v.error);
  const r = await db.report.create({
    data: {
      workspaceId: wid,
      name: p.data.name,
      configJson: JSON.stringify(v.config),
      scheduleJson: JSON.stringify(p.data.schedule ?? { freq: "off" }),
      recipientsJson: JSON.stringify(p.data.recipients ?? []),
      shared: p.data.shared ?? false,
      createdBy: a.ctx.user.id,
    },
  });
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "report", r.id, `Tạo báo cáo “${r.name}”`);
  return ok(await toDTO(a.ctx, r, a.ctx.config), 201);
}
