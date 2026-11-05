import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { parseSteps, resolveTemplate, sequenceStats } from "@/lib/marketing/sequences";
import { SEQ_TEMPLATES } from "@/lib/marketing/shared";
import { SequenceIn } from "./schema";

export async function GET() {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const [list, stats] = await Promise.all([db.sequence.findMany({ where: { workspaceId: wid }, orderBy: { createdAt: "asc" } }), sequenceStats(wid)]);
  return ok({ sequences: list.map((s) => ({ ...s, steps: parseSteps(s.stepsJson), stats: stats[s.id] ?? { active: 0, total: 0, done: 0, sent: 0, replied: 0 } })) });
}

/** Tạo kịch bản: từ mẫu dựng sẵn ({ template }) hoặc từ trình tạo. */
export async function POST(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const body = (await req.json().catch(() => ({}))) as { template?: string };
  let input;
  if (body.template) {
    const t = SEQ_TEMPLATES.find((x) => x.key === body.template);
    if (!t) return fail("Mẫu không tồn tại");
    input = { ...resolveTemplate(t, a.ctx.config), enabled: false, stopOnReply: true };
  } else {
    const p = SequenceIn.safeParse(body);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    input = p.data;
  }
  const s = await db.sequence.create({
    data: { workspaceId: a.ctx.workspace.id, name: input.name, triggerType: input.triggerType, objectKey: input.objectKey, triggerValue: input.triggerValue, stepsJson: JSON.stringify(parseSteps(input.steps)), enabled: input.enabled, stopOnReply: input.stopOnReply },
  });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "create", "sequence", s.id, `Tạo kịch bản chăm sóc “${s.name}”`);
  return ok({ id: s.id });
}
