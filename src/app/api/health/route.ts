import { ok } from "@/lib/http";
import { clearHealthCache, runChecks } from "@/lib/health";
import { healthApi } from "./guard";

/** GET /api/health?live=1&key=sys.db → { checks }. live=1 gọi thử thật dịch vụ ngoài; key = chỉ một dòng. */
export async function GET(req: Request) {
  const g = await healthApi();
  if ("error" in g) return g.error;
  const u = new URL(req.url);
  const live = u.searchParams.get("live") === "1";
  const only = u.searchParams.get("key") || undefined;
  const checks = await runChecks(g.ctx.workspace.id, { live, only });
  if (!only) clearHealthCache(g.ctx.workspace.id);
  return ok({ checks, at: new Date().toISOString() });
}
