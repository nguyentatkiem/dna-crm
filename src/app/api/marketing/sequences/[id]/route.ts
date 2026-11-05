import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { marketingApi } from "@/lib/marketing/guard";
import { parseSteps } from "@/lib/marketing/sequences";
import { SequenceIn } from "../schema";

type P = { params: Promise<{ id: string }> };

/** Sửa kịch bản, hoặc chỉ bật/tắt ({ enabled }). */
export async function PATCH(req: Request, { params }: P) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await db.sequence.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!s) return fail("Không tìm thấy kịch bản", 404);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (Object.keys(body).length === 1 && typeof body.enabled === "boolean") {
    await db.sequence.update({ where: { id }, data: { enabled: body.enabled } });
    await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "sequence", id, `${body.enabled ? "Bật" : "Tắt"} kịch bản “${s.name}”`);
    return ok({ ok: true });
  }
  const p = SequenceIn.safeParse(body);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const d = p.data;
  await db.sequence.update({ where: { id }, data: { name: d.name, triggerType: d.triggerType, objectKey: d.objectKey, triggerValue: d.triggerValue, stepsJson: JSON.stringify(parseSteps(d.steps)), enabled: d.enabled, stopOnReply: d.stopOnReply } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "update", "sequence", id, `Sửa kịch bản “${d.name}”`);
  return ok({ ok: true });
}

export async function DELETE(_req: Request, { params }: P) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const { id } = await params;
  const s = await db.sequence.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!s) return fail("Không tìm thấy kịch bản", 404);
  await db.sequence.delete({ where: { id } });
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "delete", "sequence", id, `Xoá kịch bản chăm sóc “${s.name}”`);
  return ok({ ok: true });
}
