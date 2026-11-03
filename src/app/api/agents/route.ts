import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { AGENTS, AUTONOMY } from "@/lib/agents";

const Body = z.object({
  key: z.enum(AGENTS.map((a) => a.key) as [string, ...string[]]),
  enabled: z.boolean().optional(),
  autonomy: z.enum(AUTONOMY.map((a) => a.key) as [string, ...string[]]).optional(),
});

export async function PATCH(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Yêu cầu không hợp lệ");
  const { key, enabled, autonomy } = parsed.data;
  const wid = a.ctx.workspace.id;
  const row = await db.agentSetting.upsert({
    where: { workspaceId_agentKey: { workspaceId: wid, agentKey: key } },
    update: { enabled, autonomy },
    create: { workspaceId: wid, agentKey: key, enabled: enabled ?? false, autonomy: autonomy ?? "suggest" },
  });
  return ok(row);
}
