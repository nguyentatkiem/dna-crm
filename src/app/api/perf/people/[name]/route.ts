import { appApi, fail, ok } from "@/lib/http";
import { perfAccess } from "@/lib/perf/access";
import { personBoard, rangeFromQuery } from "@/lib/perf/board";

type Ctx = { params: Promise<{ name: string }> };

/** Hồ sơ hiệu suất một người (?range…). Nhân viên chỉ xem được của mình, trưởng nhóm xem thành viên đội mình. */
export async function GET(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const who = decodeURIComponent((await params).name).trim();
  const access = await perfAccess(a.ctx);
  if (!access.canSeePerson(who)) return fail("Bạn chỉ xem được hồ sơ hiệu suất của mình hoặc thành viên đội mình", 403);
  const b = await personBoard(a.ctx.workspace.id, a.ctx.config, access, who, rangeFromQuery(new URL(req.url).searchParams));
  if (!b) return fail(`Không có “${who}” trong danh sách nhân viên`, 404);
  return ok(b);
}
