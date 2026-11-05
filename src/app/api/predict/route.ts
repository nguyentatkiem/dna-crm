import { appApi, ok } from "@/lib/http";
import { forecastWorkspace } from "@/lib/predict";

/** Dự báo doanh thu và khả năng chốt của workspace. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok(await forecastWorkspace(a.ctx.workspace.id));
}
