import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { SegmentBody, members, scopedRows } from "../shared";

const Body = SegmentBody.omit({ name: true });

/** Xem trước thành viên của bộ lọc chưa lưu: tổng số và 20 mục đầu. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Bộ lọc chưa hợp lệ");
  if (!getObject(a.ctx.config, p.data.objectKey)) return fail("Không có bảng này");
  return ok(members(a.ctx.config, p.data.objectKey, await scopedRows(a.ctx, p.data.objectKey), p.data.filters, p.data.mode));
}
