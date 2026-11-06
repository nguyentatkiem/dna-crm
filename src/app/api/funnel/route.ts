import { ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { recordScope } from "@/lib/permissions";
import { loadFunnel, parseRange } from "@/lib/marketing/funnel";

/** Phễu chuyển đổi trong khoảng ngày (?from=YYYY-MM-DD&to=YYYY-MM-DD, mặc định 90 ngày qua). */
export async function GET(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const q = new URL(req.url).searchParams;
  const { from, to } = parseRange(q.get("from"), q.get("to"));
  const scope = await recordScope({ user: a.ctx.user, workspace: a.ctx.workspace });
  return ok({ from, to, ...(await loadFunnel(a.ctx.workspace.id, a.ctx.config, from, to, scope)) });
}
