import { appApi, fail, ok } from "@/lib/http";
import { findScopedRecord } from "@/lib/permissions";
import { TL_KINDS, type TlKind } from "@/lib/c360/kinds";
import { summaryOf, timelineOf } from "@/lib/c360/timeline";

type P = { params: Promise<{ recordId: string }> };
const KEYS = new Set<string>(TL_KINDS.map((k) => k.key));

/** Chân dung 360° của một khách: thẻ tổng quan (trang đầu) + dòng thời gian (?before= để xem cũ hơn, ?kinds=call,chat). */
export async function GET(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rec = await findScopedRecord(a.ctx, (await params).recordId);
  if (!rec || rec.objectKey !== "contacts") return fail("Không tìm thấy khách", 404);
  const u = new URL(req.url);
  const before = u.searchParams.get("before") || undefined;
  const kinds = (u.searchParams.get("kinds") ?? "").split(",").filter((k): k is TlKind => KEYS.has(k));
  const limit = Number(u.searchParams.get("limit")) || 30;
  const [summary, timeline] = await Promise.all([before || u.searchParams.get("summary") === "0" ? null : summaryOf(a.ctx, rec), timelineOf(a.ctx, rec, { before, kinds, limit })]);
  return ok({ summary, timeline });
}
