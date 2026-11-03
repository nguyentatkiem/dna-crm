import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { createRecord, toDTO } from "@/lib/records";

export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const object = new URL(req.url).searchParams.get("object") ?? "contacts";
  const rows = await db.record.findMany({
    where: { workspaceId: a.ctx.workspace.id, objectKey: object },
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
    return ok(toDTO(rec), 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không tạo được mục");
  }
}
