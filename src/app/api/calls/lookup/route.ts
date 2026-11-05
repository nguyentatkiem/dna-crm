import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { recordScope } from "@/lib/permissions";
import { findContact, normPhone } from "@/lib/sources/ingest";

/** Tìm khách theo số điện thoại (popup cuộc gọi đến). Tôn trọng quyền xem khách. */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const phone = normPhone(new URL(req.url).searchParams.get("phone") ?? "");
  if (!phone) return ok({ record: null });
  const hit = await findContact(a.ctx.workspace.id, a.ctx.config, phone);
  if (!hit) return ok({ record: null });
  const allowed = await db.record.findFirst({ where: { AND: [await recordScope(a.ctx), { id: hit.id }] }, select: { id: true, title: true, score: true } });
  return ok({ record: allowed });
}
