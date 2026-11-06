import { appApi, ok } from "@/lib/http";
import { perfAccess } from "@/lib/perf/access";
import { overviewBoard, rangeFromQuery } from "@/lib/perf/board";

/**
 * Tổng quan hiệu suất: ?range=7d|30d|90d|month|quarter|custom (&from&to dạng YYYY-MM-DD) &team=<id> &metric=<chỉ số xu hướng>.
 * Chủ/quản lý thấy mọi người, trưởng nhóm thấy đội mình, nhân viên chỉ thấy hàng của mình + hạng + trung vị đội.
 */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const access = await perfAccess(a.ctx);
  return ok(await overviewBoard(a.ctx.workspace.id, a.ctx.config, access, { ...rangeFromQuery(sp), teamId: sp.get("team"), metric: sp.get("metric") }));
}
