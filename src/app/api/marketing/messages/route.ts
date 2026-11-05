import { ok } from "@/lib/http";
import { db } from "@/lib/db";
import { marketingApi } from "@/lib/marketing/guard";

/** Nhật ký gửi tin, lọc theo kênh / trạng thái / kịch bản. */
export async function GET(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const where = {
    workspaceId: a.ctx.workspace.id,
    ...(sp.get("channel") ? { channel: sp.get("channel")! } : {}),
    ...(sp.get("status") ? { status: sp.get("status")! } : {}),
    ...(sp.get("sequenceId") ? { sequenceId: sp.get("sequenceId")! } : {}),
  };
  const take = Math.min(200, Number(sp.get("take")) || 100);
  const [items, total] = await Promise.all([db.outMessage.findMany({ where, orderBy: { createdAt: "desc" }, take }), db.outMessage.count({ where })]);
  return ok({ items, total });
}
