import { z } from "zod";
import { db } from "@/lib/db";
import { appApi, fail, ok } from "@/lib/http";
import { setPref } from "@/lib/prefs";
import { audit } from "@/lib/audit";
import { recordScope } from "@/lib/permissions";
import { careCan, contactCard, loyaltyOf, loyaltyPref } from "@/lib/care/server";
import { tierFor } from "@/lib/care/shared";

/** Bảng xếp hạng điểm: mọi khách người dùng thấy được, kèm số dư, hạng, lần giao dịch cuối. */
export async function GET() {
  const a = await appApi();
  if ("error" in a) return a.error;
  const scope = await recordScope(a.ctx);
  const contacts = await db.record.findMany({ where: { ...scope, objectKey: "contacts" }, orderBy: { updatedAt: "desc" }, take: 2000 });
  const { pref, map } = await loyaltyOf(a.ctx.workspace.id, contacts.map((c) => c.id));
  const rows = contacts
    .map((c) => {
      const s = map.get(c.id);
      const card = contactCard(a.ctx.config, c);
      return { id: c.id, title: c.title, phone: card.phone, owner: c.ownerName, balance: s?.balance ?? 0, earned: s?.earned ?? 0, lastAt: s?.lastAt ?? null, tier: s?.tier ?? tierFor(0, pref.tiers) };
    })
    .sort((x, y) => y.balance - x.balance || y.earned - x.earned);
  return ok({ pref, rows, canManage: await careCan(a.ctx, "care_settings") });
}

const Tier = z.object({ name: z.string().trim().min(1).max(40), minPoints: z.number().int().min(0), discountPct: z.number().min(0).max(100), color: z.string().max(20).default("#a0a3b1") });
const Body = z.object({
  enabled: z.boolean(),
  vndPerPoint: z.number().int().min(1).max(1e9),
  tiers: z.array(Tier).min(1).max(10),
  rewards: z.array(z.object({ name: z.string().trim().min(1).max(80), points: z.number().int().min(1) })).max(30),
});

/** Sửa cấu hình tích điểm (chủ/quản lý). */
export async function PUT(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  if (!(await careCan(a.ctx, "care_settings"))) return fail("Bạn chưa có quyền sửa cấu hình tích điểm", 403);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Cấu hình chưa hợp lệ");
  const v = { ...p.data, tiers: [...p.data.tiers].sort((x, y) => x.minPoints - y.minPoints) };
  if (v.tiers[0].minPoints !== 0) return fail("Hạng thấp nhất phải bắt đầu từ 0 điểm");
  const before = await loyaltyPref(a.ctx.workspace.id);
  await setPref(a.ctx.workspace.id, "loyalty", v);
  await audit({ workspaceId: a.ctx.workspace.id, user: a.ctx.user }, "loyalty.config", "pref", "loyalty", "Sửa cấu hình tích điểm", { before, after: v });
  return ok(v);
}
