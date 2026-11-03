import { db } from "@/lib/db";
import { apiContext } from "@/lib/auth";
import { DnaSchema } from "@/lib/dna";
import { generateConfig } from "@/lib/config/engine";
import { fail, ok } from "@/lib/http";

export const maxDuration = 120;

/** Lưu DNA và để DNA Architect sinh bản cấu hình nháp (chưa áp dụng). */
export async function POST(req: Request) {
  const ctx = await apiContext();
  if (!ctx) return fail("Bạn cần đăng nhập lại", 401);
  const parsed = DnaSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("DNA chưa đầy đủ: " + (parsed.error.issues[0]?.path.join(".") ?? ""));
  const dna = parsed.data;
  const wid = ctx.workspace.id;

  await db.dna.create({ data: { workspaceId: wid, dataJson: JSON.stringify(dna) } });
  const { config, source } = await generateConfig(dna);
  const last = await db.workspaceConfig.findFirst({ where: { workspaceId: wid }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const saved = await db.workspaceConfig.create({
    data: { workspaceId: wid, version, source, configJson: JSON.stringify({ ...config, version }) },
  });
  await db.agentLog.create({ data: { workspaceId: wid, agent: "DNA Architect", message: `Sinh cấu hình v${version} cho ${dna.businessName} (${source === "ai" ? "AI tinh chỉnh" : "template ngành"})` } });
  return ok({ configId: saved.id, config: { ...config, version }, source });
}
