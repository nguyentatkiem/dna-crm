import { appApi, ok } from "@/lib/http";
import { searchAttachables } from "@/lib/teamchat/server";

/** Tìm khách / giao dịch / đơn / việc / phiếu để đính kèm (chỉ trong phạm vi của người gửi). */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const obj = sp.get("object") ?? "";
  const objectKey = a.ctx.config.objects.some((o) => o.key === obj) ? obj : undefined;
  return ok({ items: await searchAttachables(a.ctx, sp.get("kind") ?? "record", (sp.get("q") ?? "").slice(0, 100), objectKey) });
}
