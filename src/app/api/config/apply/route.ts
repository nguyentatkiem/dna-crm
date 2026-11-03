import { z } from "zod";
import { db, parseJson } from "@/lib/db";
import { apiContext } from "@/lib/auth";
import { WorkspaceConfigSchema, type WorkspaceConfig } from "@/lib/config/schema";
import { AGENTS } from "@/lib/agents";
import { seedSample } from "@/lib/sample";
import { fail, ok } from "@/lib/http";

const Body = z.object({
  configId: z.string(),
  modules: WorkspaceConfigSchema.shape.modules.optional(),
  automations: z.array(z.boolean()).optional(),
  sample: z.boolean().default(false),
});

/** Áp dụng một phiên bản cấu hình: kích hoạt, dựng automation, agent, dữ liệu mẫu. */
export async function POST(req: Request) {
  const ctx = await apiContext();
  if (!ctx) return fail("Bạn cần đăng nhập lại", 401);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Yêu cầu không hợp lệ");
  const { configId, modules, automations, sample } = parsed.data;
  const wid = ctx.workspace.id;

  const row = await db.workspaceConfig.findFirst({ where: { id: configId, workspaceId: wid } });
  if (!row) return fail("Không tìm thấy cấu hình", 404);
  const cfg = parseJson<WorkspaceConfig | null>(row.configJson, null);
  if (!cfg) return fail("Cấu hình bị hỏng", 500);

  if (modules) cfg.modules = { ...modules, appointments: modules.appointments && cfg.objects.some((o) => o.key === "appointments") };
  if (!cfg.modules.appointments) cfg.objects = cfg.objects.filter((o) => o.key !== "appointments");
  const chosen = automations ? cfg.automations.filter((_, i) => automations[i] !== false) : cfg.automations;

  await db.$transaction([
    db.workspaceConfig.updateMany({ where: { workspaceId: wid }, data: { isActive: false } }),
    db.workspaceConfig.update({ where: { id: row.id }, data: { isActive: true, configJson: JSON.stringify(cfg) } }),
    db.workspace.update({ where: { id: wid }, data: { onboarded: true, name: cfg.businessName, industry: cfg.industry } }),
    db.automation.deleteMany({ where: { workspaceId: wid } }),
    db.automation.createMany({ data: chosen.map((a) => ({ workspaceId: wid, ...a })) }),
  ]);

  for (const a of AGENTS) {
    await db.agentSetting.upsert({
      where: { workspaceId_agentKey: { workspaceId: wid, agentKey: a.key } },
      update: {},
      create: { workspaceId: wid, agentKey: a.key, enabled: cfg.agents.includes(a.key) || a.key === "builder", autonomy: a.key === "copilot" ? "auto" : "suggest" },
    });
  }

  // Bản ghi cũ có trạng thái không còn trong cấu hình mới → đưa về trạng thái đầu tiên.
  for (const o of cfg.objects) {
    await db.record.updateMany({ where: { workspaceId: wid, objectKey: o.key, status: { notIn: o.statuses.map((s) => s.key) } }, data: { status: o.statuses[0].key } });
  }

  if (sample && (await db.record.count({ where: { workspaceId: wid } })) === 0) await seedSample(wid, cfg);
  return ok({ redirect: "/w" });
}
