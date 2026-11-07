import { appApi, ok } from "@/lib/http";
import { totalUnread } from "@/lib/teamchat/server";

/** Tổng tin chưa đọc (cho huy hiệu trên thanh trên cùng). */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  return ok({ total: await totalUnread(a.ctx) });
}
