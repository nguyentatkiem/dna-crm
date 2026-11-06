import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { originOf, rememberOrigin, tickBroadcasts } from "@/lib/marketing/broadcast";
import { BroadcastIn, contentError, scheduleOf } from "../schema";

type P = { params: Promise<{ id: string }> };

async function load(wid: string, id: string) {
  return db.broadcast.findFirst({ where: { id, workspaceId: wid } });
}

export async function GET(_: Request, { params }: P) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const b = await load(a.ctx.workspace.id, (await params).id);
  if (!b) return fail("Không tìm thấy đợt gửi", 404);
  const messages = await db.outMessage.findMany({ where: { broadcastId: b.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return ok({ broadcast: b, messages });
}

/** { action: "cancel" } huỷ; { action: "send" } gửi ngay; còn lại là sửa nội dung (chỉ khi chưa gửi). */
export async function PATCH(req: Request, { params }: P) {
  const a = await marketingApi("broadcast_send");
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const b = await load(wid, (await params).id);
  if (!b) return fail("Không tìm thấy đợt gửi", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const who = { workspaceId: wid, user: a.ctx.user };

  if (body.action === "cancel") {
    if (!["draft", "scheduled", "sending"].includes(b.status)) return fail("Đợt gửi đã kết thúc, không huỷ được");
    await db.broadcast.update({ where: { id: b.id }, data: { status: "cancelled", finishedAt: new Date() } });
    await audit(who, "update", "broadcast", b.id, `Huỷ đợt gửi “${b.name}”`);
    return ok({ ok: true });
  }

  if (b.status !== "draft" && b.status !== "scheduled") return fail("Đợt gửi đã bắt đầu, không sửa được nữa");
  const p = BroadcastIn.safeParse({ ...b, scheduledAt: b.scheduledAt?.toISOString() ?? null, when: "draft", ...body });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  if (d.when !== "draft") {
    const err = contentError(d);
    if (err) return fail(err);
  }
  const sch = scheduleOf(d.when, d.scheduledAt);
  if ("error" in sch) return fail(sch.error);
  await db.broadcast.update({
    where: { id: b.id },
    data: { name: d.name, channel: d.channel, segmentId: d.segmentId || null, subject: d.subject, body: d.body, templateId: d.templateId, status: sch.status, scheduledAt: sch.scheduledAt },
  });
  await rememberOrigin(wid, originOf(req)).catch(() => undefined);
  await audit(who, "update", "broadcast", b.id, `Sửa đợt gửi “${d.name}”`);
  if (d.when === "now") void tickBroadcasts({ id: b.id }).catch(() => undefined);
  return ok({ ok: true });
}

export async function DELETE(_: Request, { params }: P) {
  const a = await marketingApi("broadcast_send");
  if ("error" in a) return a.error;
  const b = await load(a.ctx.workspace.id, (await params).id);
  if (!b) return fail("Không tìm thấy đợt gửi", 404);
  if (b.status === "sending") return fail("Đợt đang gửi: hãy huỷ trước khi xoá");
  await db.broadcast.delete({ where: { id: b.id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "broadcast", b.id, `Xoá đợt gửi “${b.name}” (nhật ký gửi vẫn giữ)`);
  return ok({ ok: true });
}
