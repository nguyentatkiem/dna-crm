import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { ObjectDef } from "@/lib/config/schema";

const Body = z.object({ objects: z.array(ObjectDef) });

/** Lưu chỉnh sửa trường/trạng thái thành một phiên bản cấu hình mới (khôi phục được trong lịch sử). */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Cấu hình chưa hợp lệ");
  const cur = a.ctx.config;
  const wid = a.ctx.workspace.id;
  const objects = parsed.data.objects;

  for (const o of objects) {
    if (!cur.objects.some((c) => c.key === o.key)) return fail("Không được thêm bảng mới ở đây");
    if (o.statuses.length < 2) return fail(`Bảng ${o.label} cần ít nhất 2 trạng thái`);
    if (new Set(o.statuses.map((s) => s.key)).size !== o.statuses.length || new Set(o.fields.map((f) => f.key)).size !== o.fields.length) return fail("Có tên trùng nhau, hãy đổi tên khác");
    if (!o.label.trim() || o.statuses.some((s) => !s.label.trim()) || o.fields.some((f) => !f.label.trim())) return fail("Tên không được để trống");
  }
  const kept = cur.objects.map((c) => objects.find((o) => o.key === c.key) ?? c);
  const last = await db.workspaceConfig.findFirst({ where: { workspaceId: wid }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  const next = { ...cur, version, objects: kept, terminology: { ...cur.terminology, contact: kept.find((o) => o.key === "contacts")?.label ?? cur.terminology.contact, deal: kept.find((o) => o.key === "deals")?.label ?? cur.terminology.deal } };

  await db.$transaction([
    db.workspaceConfig.updateMany({ where: { workspaceId: wid }, data: { isActive: false } }),
    db.workspaceConfig.create({ data: { workspaceId: wid, version, source: "manual", isActive: true, configJson: JSON.stringify(next) } }),
    ...kept.map((o) => db.record.updateMany({ where: { workspaceId: wid, objectKey: o.key, status: { notIn: o.statuses.map((s) => s.key) } }, data: { status: o.statuses[0].key } })),
  ]);
  return ok({ version });
}
