import { ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { tickBroadcasts } from "@/lib/marketing/broadcast";

/** Chạy một lượt gửi ngay (không chờ việc nền). */
export async function POST() {
  const a = await marketingApi("broadcast_send");
  if ("error" in a) return a.error;
  await tickBroadcasts({ workspaceId: a.ctx.workspace.id });
  return ok({ ok: true });
}
