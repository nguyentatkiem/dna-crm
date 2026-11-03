import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { getObject } from "@/lib/config/schema";
import { scoreContact } from "@/lib/records";

const Body = z.object({
  objectKey: z.string(),
  rows: z
    .array(
      z.object({
        title: z.string(),
        status: z.string().optional(),
        ownerName: z.string().optional(),
        amount: z.number().optional(),
        data: z.record(z.string(), z.union([z.string(), z.number()])),
      }),
    )
    .max(5000),
});

/** Nhập hàng loạt. Bảng khách bỏ qua dòng trùng số điện thoại. Không chạy tự động hoá để tránh tạo hàng nghìn việc. */
export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu nhập không hợp lệ");
  const { objectKey, rows } = parsed.data;
  const obj = getObject(a.ctx.config, objectKey);
  if (!obj) return fail("Không có bảng này", 404);
  const wid = a.ctx.workspace.id;

  const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
  const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
  const existing = new Set<string>();
  if (phoneKey) {
    const old = await db.record.findMany({ where: { workspaceId: wid, objectKey }, select: { dataJson: true } });
    for (const r of old) {
      const p = digits(JSON.parse(r.dataJson)[phoneKey]);
      if (p) existing.add(p);
    }
  }

  let created = 0;
  let skipped = 0;
  const statusByLabel = new Map(obj.statuses.flatMap((s) => [[s.key, s.key], [s.label.toLowerCase(), s.key]] as [string, string][]));
  for (const r of rows) {
    if (!r.title.trim()) {
      skipped++;
      continue;
    }
    const p = phoneKey ? digits(r.data[phoneKey]) : "";
    if (p && existing.has(p)) {
      skipped++;
      continue;
    }
    if (p) existing.add(p);
    await db.record.create({
      data: {
        workspaceId: wid,
        objectKey,
        title: r.title.trim().slice(0, 200),
        status: statusByLabel.get((r.status ?? "").toLowerCase()) ?? obj.statuses[0].key,
        ownerName: r.ownerName ?? "",
        amount: r.amount ?? 0,
        score: objectKey === "contacts" ? scoreContact(r.data, a.ctx.config) : 0,
        dataJson: JSON.stringify(r.data),
        activities: { create: [{ kind: "system", body: "Nhập từ file Excel/CSV", author: a.ctx.user.name }] },
      },
    });
    created++;
  }
  await db.agentLog.create({ data: { workspaceId: wid, agent: "Nhập dữ liệu", message: `Nhập ${created} mục vào ${obj.label}, bỏ qua ${skipped} dòng trùng hoặc trống` } });
  return ok({ created, skipped });
}
