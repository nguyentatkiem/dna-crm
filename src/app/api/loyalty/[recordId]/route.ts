import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { audit } from "@/lib/audit";
import { findScopedRecord } from "@/lib/permissions";
import { careCan, loyaltyPref } from "@/lib/care/server";
import { nextTier, summarize, tierFor } from "@/lib/care/shared";

type P = { params: Promise<{ recordId: string }> };

async function view(workspaceId: string, recordId: string) {
  const pref = await loyaltyPref(workspaceId);
  const txns = await db.loyaltyTxn.findMany({ where: { workspaceId, recordId }, orderBy: { createdAt: "desc" } });
  const s = summarize(txns);
  return {
    pref: { enabled: pref.enabled, vndPerPoint: pref.vndPerPoint, rewards: pref.rewards, tiers: pref.tiers },
    ...s,
    tier: tierFor(s.earned, pref.tiers),
    next: nextTier(s.earned, pref.tiers),
    history: txns.slice(0, 20).map((t) => ({ id: t.id, points: t.points, reason: t.reason, by: t.createdBy, orderId: t.orderId, at: t.createdAt.toISOString() })),
  };
}

/** Số dư, hạng, lịch sử gần đây của một khách. */
export async function GET(_req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const rec = await findScopedRecord(a.ctx, (await params).recordId);
  if (!rec) return fail("Không tìm thấy khách", 404);
  return ok({ ...(await view(a.ctx.workspace.id, rec.id)), canAdjust: await careCan(a.ctx, "loyalty_adjust") });
}

const Body = z.union([
  z.object({ kind: z.literal("adjust"), points: z.number().int().refine((n) => n !== 0, "Số điểm phải khác 0").refine((n) => Math.abs(n) <= 1e6, "Số điểm quá lớn"), reason: z.string().trim().min(1, "Nhập lý do").max(200) }),
  z.object({ kind: z.literal("redeem"), reward: z.number().int().min(0) }),
]);

/** Cộng/trừ tay (chủ/quản lý) hoặc đổi quà (mọi người). Số dư không được âm. */
export async function POST(req: Request, { params }: P) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const rec = await findScopedRecord(a.ctx, (await params).recordId);
  if (!rec || rec.objectKey !== "contacts") return fail("Không tìm thấy khách", 404);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ");
  const pref = await loyaltyPref(wid);
  let points: number;
  let reason: string;
  if (p.data.kind === "adjust") {
    if (!(await careCan(a.ctx, "loyalty_adjust"))) return fail("Bạn chưa có quyền cộng/trừ điểm tay", 403);
    points = p.data.points;
    reason = p.data.reason;
  } else {
    const r = pref.rewards[p.data.reward];
    if (!r) return fail("Không có phần quà này", 404);
    points = -r.points;
    reason = `Đổi quà: ${r.name}`;
  }
  // Tính số dư và ghi trong cùng giao dịch để hai lần đổi quà cùng lúc không làm âm điểm.
  const res = await db.$transaction(async (tx) => {
    const agg = await tx.loyaltyTxn.aggregate({ where: { workspaceId: wid, recordId: rec.id }, _sum: { points: true } });
    const bal = agg._sum.points ?? 0;
    if (bal + points < 0) return { error: `Không đủ điểm: số dư ${bal}, cần ${-points}` };
    await tx.loyaltyTxn.create({ data: { workspaceId: wid, recordId: rec.id, points, reason, createdBy: a.ctx.user.name } });
    return { balance: bal + points };
  });
  if ("error" in res) return fail(res.error!, 400);
  await db.activity.create({ data: { recordId: rec.id, kind: "update", body: `${points > 0 ? "+" : ""}${points} điểm · ${reason}. Số dư: ${res.balance}`, author: a.ctx.user.name } });
  await audit({ workspaceId: wid, user: a.ctx.user }, p.data.kind === "adjust" ? "loyalty.adjust" : "loyalty.redeem", "contacts", rec.id, `${rec.title}: ${points > 0 ? "+" : ""}${points} điểm (${reason})`);
  return ok({ ...(await view(wid, rec.id)), canAdjust: await careCan(a.ctx, "loyalty_adjust") }, 201);
}
