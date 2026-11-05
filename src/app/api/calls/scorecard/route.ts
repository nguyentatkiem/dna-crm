import { z } from "zod";
import { db } from "@/lib/db";
import { isOwner } from "@/lib/auth";
import { appApi, fail, ok } from "@/lib/http";
import { getScorecard } from "@/lib/calls";

const Body = z.object({
  criteria: z.array(z.object({ key: z.string(), label: z.string().min(1).max(80), weight: z.number().int().min(0).max(100), guide: z.string().max(500), keywords: z.array(z.string().max(40)).max(20) })).min(1).max(10),
  scriptText: z.string().max(20000),
});

/** Chủ sửa phiếu chấm / kịch bản bằng tay → lưu phiên bản mới. */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  if (!(await isOwner(a.ctx.user.id, wid))) return fail("Chỉ chủ workspace được sửa phiếu chấm", 403);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const sum = parsed.data.criteria.reduce((s, c) => s + c.weight, 0);
  if (sum !== 100) return fail(`Tổng trọng số phải bằng 100 (đang là ${sum})`);
  const cur = await getScorecard(wid, a.ctx.config);
  await db.$transaction([
    db.scorecard.updateMany({ where: { workspaceId: wid }, data: { isActive: false } }),
    db.scorecard.create({ data: { workspaceId: wid, version: cur.version + 1, criteriaJson: JSON.stringify(parsed.data.criteria), scriptText: parsed.data.scriptText, source: "manual", note: "Sửa tay", isActive: true } }),
  ]);
  return ok({ ok: true, version: cur.version + 1 });
}
