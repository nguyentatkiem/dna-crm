import { appApi, ok } from "@/lib/http";
import { forecastWorkspace, refreshPredictions } from "@/lib/predict";

/** Chạy lại dự báo ngay (thường job nền chạy mỗi giờ). */
export async function POST() {
  const a = await appApi();
  if ("error" in a) return a.error;
  await refreshPredictions(a.ctx.workspace.id);
  return ok(await forecastWorkspace(a.ctx.workspace.id));
}
