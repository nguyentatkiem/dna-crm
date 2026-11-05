import { ok } from "@/lib/http";
import { recordScope } from "@/lib/permissions";
import { marketingApi } from "@/lib/marketing/guard";
import { aiInsights, buildAdReport } from "@/lib/marketing/report";

/** Nhận xét của Marketing Analyst: Claude nếu có key, không thì luật. */
export async function POST(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const { days } = (await req.json().catch(() => ({}))) as { days?: number };
  const d = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const rep = await buildAdReport(a.ctx.workspace.id, a.ctx.config, d, await recordScope(a.ctx));
  const bullets = await aiInsights(rep, a.ctx.config);
  return ok({ bullets: bullets ?? rep.insights, source: bullets ? "ai" : "rules" });
}
