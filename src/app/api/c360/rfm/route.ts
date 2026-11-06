import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { accessOf, allow } from "@/lib/permissions";
import { resolveSegment } from "@/lib/care/segments";
import { dataOf } from "@/lib/c360/common";
import { RFM_LABEL, RFM_SEGMENTS, rfmFilter, type RfmKey } from "@/lib/c360/rfm";
import { recomputeRfm, rfmPref } from "@/lib/c360/rfm-data";

const Body = z.union([z.object({ action: z.literal("recompute") }), z.object({ action: z.literal("segment"), key: z.enum(RFM_SEGMENTS.map((s) => s.key) as [RfmKey, ...RfmKey[]]) })]);

/** Tính lại RFM ngay, hoặc lưu một nhóm RFM thành Nhóm khách. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Yêu cầu RFM chưa hợp lệ");
  const acc = await accessOf(a.ctx);
  if (p.data.action === "recompute") {
    if (!allow(acc, "segment_manage")) return fail("Bạn chưa có quyền “Quản lý nhóm khách” để tính lại RFM", 403);
    const pref = await rfmPref(wid);
    return ok(await recomputeRfm(wid, a.ctx.config, { fire: !!pref.lastRun }));
  }
  const key = p.data.key;
  // Nhóm khách lọc theo _rfm đã ghi trên hồ sơ; ghi lại nếu đã cũ để số khách khớp với thẻ trên trang RFM (tính trực tiếp).
  const pref = await rfmPref(wid);
  if (Date.now() - pref.lastRun > 5 * 60e3) await recomputeRfm(wid, a.ctx.config, { fire: !!pref.lastRun });
  const name = `RFM · ${RFM_LABEL[key]}`;
  const existing = await db.segment.findFirst({ where: { workspaceId: wid, name } });
  const seg = existing ?? (await db.segment.create({ data: { workspaceId: wid, objectKey: "contacts", name, filtersJson: JSON.stringify(rfmFilter(key)), mode: "and", createdBy: a.ctx.user.name } }));
  // Kiểm tra bộ lọc thật sự lọc theo _rfm (bảng chưa hỗ trợ trường ẩn thì nhóm sẽ ra cả danh bạ → không được lưu).
  const contacts = await db.record.findMany({ where: { workspaceId: wid, objectKey: "contacts" }, select: { dataJson: true } });
  const expected = contacts.filter((c) => dataOf(c)._rfm === key).length;
  const got = (await resolveSegment(wid, seg.id)).length;
  if (got !== expected) {
    if (!existing) await db.segment.delete({ where: { id: seg.id } });
    return fail("Bộ lọc nhóm khách chưa hỗ trợ trường Nhóm RFM, chưa lưu được. Hãy cập nhật phiên bản mới.", 409);
  }
  if (!existing) await audit({ workspaceId: wid, user: a.ctx.user }, "segment.create", "segment", seg.id, `Tạo nhóm khách “${name}” từ phân tích RFM`);
  return ok({ id: seg.id, name, count: got, existed: !!existing, canBroadcast: allow(acc, "broadcast_send") });
}
