import { db } from "@/lib/db";
import { appApi, ok } from "@/lib/http";
import { rulesForTier, tierOfContact } from "@/lib/sales/tier-pricing";

/** Cho trình soạn báo giá/đơn: hạng của khách và các quy tắc giá của hạng đó. ?contactId= */
export async function GET(req: Request) {
  const a = await appApi();
  if ("error" in a) return a.error;
  const wid = a.ctx.workspace.id;
  const contactId = new URL(req.url).searchParams.get("contactId") ?? "";
  const exists = contactId ? await db.record.findFirst({ where: { id: contactId, workspaceId: wid }, select: { id: true } }) : null;
  if (!exists) return ok({ tier: null, rules: [] });
  const tier = await tierOfContact(wid, contactId);
  const rules = await rulesForTier(wid, tier?.name);
  return ok({ tier: tier ? { name: tier.name, color: tier.color, earned: tier.earned } : null, rules });
}
