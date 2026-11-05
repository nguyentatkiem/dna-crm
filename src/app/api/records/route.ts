import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { createRecord, toDTO } from "@/lib/records";
import { recordScope } from "@/lib/permissions";
import { audit, recordSnapshot } from "@/lib/audit";
import { notify, userIdByName } from "@/lib/notify";
import { getObject } from "@/lib/config/schema";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const object = new URL(req.url).searchParams.get("object") ?? "contacts";
  const scope = await recordScope(a.ctx);
  const rows = await db.record.findMany({
    where: { ...scope, objectKey: object },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { activities: true } } },
  });
  return ok(rows.map(toDTO));
}

const Body = z.object({
  objectKey: z.string(),
  title: z.string().max(200),
  status: z.string().optional(),
  ownerName: z.string().optional(),
  amount: z.number().optional(),
  data: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export async function POST(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("Dữ liệu chưa hợp lệ");
  try {
    const rec = await createRecord(a.ctx.workspace.id, a.ctx.config, parsed.data, a.ctx.user.name);
    const obj = getObject(a.ctx.config, rec.objectKey);
    const who = { workspaceId: a.ctx.workspace.id, user: a.ctx.user };
    await audit(who, "record.create", rec.objectKey, rec.id, `Tạo ${obj?.itemLabel.toLowerCase() ?? "mục"} “${rec.title}”`, { after: recordSnapshot(rec) });
    if (rec.ownerName && rec.ownerName !== a.ctx.user.name) {
      const userId = await userIdByName(a.ctx.workspace.id, rec.ownerName);
      if (userId) await notify(a.ctx.workspace.id, { userId, kind: "lead", text: `${a.ctx.user.name} giao cho bạn ${obj?.itemLabel.toLowerCase() ?? "mục"} “${rec.title}”`, href: `/w/b/${rec.objectKey}?open=${rec.id}` });
    }
    return ok(toDTO(rec), 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không tạo được mục");
  }
}
