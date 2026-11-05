import { ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { scanInactive, tickSequences } from "@/lib/marketing/sequences";

/** Chạy kịch bản ngay (không chờ job nền mỗi phút). */
export async function POST() {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const enrolled = await scanInactive(true);
  await tickSequences();
  return ok({ ok: true, enrolled });
}
