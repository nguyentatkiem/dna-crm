import { z } from "zod";
import { db, parseJson } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getObject, type WorkspaceConfig } from "@/lib/config/schema";
import { createRecord } from "@/lib/records";

const Body = z.object({
  name: z.string().trim().min(1, "Hãy nhập họ tên").max(120),
  phone: z.string().trim().regex(/^[0-9+\s.-]{8,15}$/, "Số điện thoại chưa đúng"),
  email: z.string().trim().max(120).optional(),
  need: z.string().trim().max(2000).optional(),
  extra: z.record(z.string(), z.string().max(200)).optional(),
  website: z.string().optional(), // bẫy bot: người thật không thấy ô này
});

/** Form thu lead công khai: tạo khách mới, chấm điểm và chạy tự động hoá như khi nhập tay. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const ws = await db.workspace.findUnique({ where: { formKey: key } });
  if (!ws) return fail("Form không tồn tại", 404);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ");
  const b = parsed.data;
  if (b.website) return ok({ ok: true });

  const cfgRow = await db.workspaceConfig.findFirst({ where: { workspaceId: ws.id, isActive: true } });
  const cfg = parseJson<WorkspaceConfig | null>(cfgRow?.configJson, null);
  const obj = cfg && getObject(cfg, "contacts");
  if (!cfg || !obj) return fail("CRM chưa sẵn sàng", 409);

  const data: Record<string, string> = {};
  const phoneKey = obj.fields.find((f) => f.type === "phone")?.key;
  const emailKey = obj.fields.find((f) => f.type === "email")?.key;
  if (phoneKey) data[phoneKey] = b.phone;
  if (emailKey && b.email) data[emailKey] = b.email;
  for (const f of obj.fields.filter((x) => x.type === "select")) {
    const v = b.extra?.[f.key];
    if (v && f.options.some((o) => o.label === v)) data[f.key] = v;
  }
  if (obj.fields.some((f) => f.key === "nguon")) data["nguon"] = "Website";

  const rec = await createRecord(ws.id, cfg, { objectKey: "contacts", title: b.name, data }, "Form website");
  if (b.need) await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `Nhu cầu khách để lại: ${b.need}`, author: b.name } });
  await db.agentLog.create({ data: { workspaceId: ws.id, agent: "Form thu lead", message: `Lead mới: ${b.name}` } });
  return ok({ ok: true }, 201);
}
