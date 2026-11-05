import { z } from "zod";
import { appApi, fail, ok } from "@/lib/http";
import { WIDGET_TYPES, WidgetConfig, computeWidget, createLoader } from "@/lib/widgets";

const Body = z.object({ type: z.enum(WIDGET_TYPES), config: WidgetConfig });

/** Xem trước dữ liệu một widget khi đang cấu hình. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Cấu hình widget chưa hợp lệ");
  const data = await computeWidget(createLoader(a.ctx, a.ctx.config), parsed.data.type, parsed.data.config);
  return ok({ data });
}
