import { z } from "zod";
import { db, parseJson } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { runAutomations, toDTO, type FieldValue } from "@/lib/records";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  title: z.string().max(200).optional(),
  status: z.string().optional(),
  ownerName: z.string().optional(),
  amount: z.number().optional(),
  data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const rec = await db.record.findFirst({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!rec) return fail("Không tìm thấy mục", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  const p = parsed.data;
  const obj = getObject(a.ctx.config, rec.objectKey);
  if (p.status && !obj?.statuses.some((s) => s.key === p.status)) return fail("Trạng thái không có trong bảng này");

  const data = p.data ? { ...parseJson<Record<string, FieldValue>>(rec.dataJson, {}), ...p.data } : undefined;
  const updated = await db.record.update({
    where: { id },
    data: { title: p.title, status: p.status, ownerName: p.ownerName, amount: p.amount, dataJson: data ? JSON.stringify(data) : undefined },
    include: { _count: { select: { activities: true } } },
  });

  if (p.status && p.status !== rec.status) {
    const from = obj?.statuses.find((s) => s.key === rec.status)?.label ?? rec.status;
    const to = obj?.statuses.find((s) => s.key === p.status)?.label ?? p.status;
    await db.activity.create({ data: { recordId: id, kind: "system", body: `${a.ctx.user.name} đổi ${obj?.statusLabel.toLowerCase()} từ “${from}” sang “${to}”`, author: a.ctx.user.name } });
    await runAutomations(a.ctx.workspace.id, a.ctx.config, { kind: "status_changed", record: updated });
  }
  const fresh = await db.record.findUniqueOrThrow({ where: { id }, include: { _count: { select: { activities: true } } } });
  return ok(toDTO(fresh));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const { id } = await params;
  const { count } = await db.record.deleteMany({ where: { id, workspaceId: a.ctx.workspace.id } });
  if (!count) return fail("Không tìm thấy mục", 404);
  await db.task.deleteMany({ where: { recordId: id } });
  return ok({ deleted: true });
}
