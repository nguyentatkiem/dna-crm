import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { db } from "@/lib/db";
import { recordScope } from "@/lib/permissions";
import { marketingApi } from "@/lib/marketing/guard";
import { buildAdReport } from "@/lib/marketing/report";
import { parseDay, providerOf, upsertSpend } from "@/lib/marketing/ads";

const days = (v: string | null) => ([7, 30, 90].includes(Number(v)) ? Number(v) : 30);

/** Báo cáo hiệu quả quảng cáo theo khoảng ngày (7/30/90). */
export async function GET(req: Request) {
  const a = await marketingApi(false);
  if ("error" in a) return a.error;
  const d = days(new URL(req.url).searchParams.get("days"));
  return ok(await buildAdReport(a.ctx.workspace.id, a.ctx.config, d, await recordScope(a.ctx)));
}

const Manual = z.object({
  date: z.string(),
  provider: z.string().max(40),
  campaign: z.string().min(1, "Nhập tên chiến dịch").max(200),
  spend: z.coerce.number().min(0),
  impressions: z.coerce.number().min(0).optional(),
  clicks: z.coerce.number().min(0).optional(),
  leads: z.coerce.number().min(0).optional(),
});

/** Nhập tay chi phí một ngày của một chiến dịch. Cùng ngày + chiến dịch thì ghi đè. */
export async function POST(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const p = Manual.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const date = parseDay(p.data.date);
  if (!date) return fail("Ngày không hợp lệ");
  const n = await upsertSpend(a.ctx.workspace.id, [{ ...p.data, date, provider: providerOf(p.data.provider) }], "manual");
  return ok({ rows: n });
}

/** Xoá chi phí: theo id, hoặc mọi dòng nhập tay/CSV của một chiến dịch (?campaign=). */
export async function DELETE(req: Request) {
  const a = await marketingApi(true);
  if ("error" in a) return a.error;
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const campaign = sp.get("campaign");
  if (!id && !campaign) return fail("Thiếu id hoặc chiến dịch");
  const r = await db.adSpend.deleteMany({ where: { workspaceId: a.ctx.workspace.id, ...(id ? { id } : { campaign: campaign!, source: { in: ["manual", "csv", "sample"] } }) } });
  return ok({ deleted: r.count });
}
