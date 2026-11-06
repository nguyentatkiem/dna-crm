import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { originOf, rememberOrigin, tickBroadcasts } from "@/lib/marketing/broadcast";
import { BroadcastIn, contentError, scheduleOf } from "./schema";

export async function GET() {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const list = await db.broadcast.findMany({ where: { workspaceId: a.ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return ok({ broadcasts: list });
}

/** Tạo đợt gửi: lưu nháp, gửi ngay hoặc hẹn giờ. */
export async function POST(req: Request) {
  const a = await marketingApi("broadcast_send");
  if ("error" in a) return a.error;
  const p = BroadcastIn.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  const wid = a.ctx.workspace.id;
  if (d.when !== "draft") {
    const err = contentError(d);
    if (err) return fail(err);
  }
  if (d.segmentId && !(await db.segment.findFirst({ where: { id: d.segmentId, workspaceId: wid }, select: { id: true } }))) return fail("Nhóm khách không tồn tại");
  const sch = scheduleOf(d.when, d.scheduledAt);
  if ("error" in sch) return fail(sch.error);
  const b = await db.broadcast.create({
    data: { workspaceId: wid, name: d.name, channel: d.channel, segmentId: d.segmentId || null, subject: d.subject, body: d.body, templateId: d.templateId, status: sch.status, scheduledAt: sch.scheduledAt, createdBy: a.ctx.user.name },
  });
  await rememberOrigin(wid, originOf(req)).catch(() => undefined);
  await audit({ workspaceId: wid, user: a.ctx.user }, "create", "broadcast", b.id, `Tạo đợt gửi “${b.name}” (${d.when === "now" ? "gửi ngay" : d.when === "later" ? "hẹn giờ" : "nháp"})`);
  // Gửi ngay: chạy lô đầu luôn, các lô sau do việc nền đảm nhận.
  if (d.when === "now") void tickBroadcasts({ id: b.id }).catch(() => undefined);
  return ok({ id: b.id }, 201);
}
