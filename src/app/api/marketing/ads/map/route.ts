import { fail, ok } from "@/lib/http";
import { marketingApi } from "@/lib/marketing/guard";
import { setCampaignMapping } from "@/lib/marketing/store";

/** Ghép thủ công chiến dịch quảng cáo với tên chiến dịch của lead trong CRM. crmCampaign rỗng = bỏ ghép. */
export async function PUT(req: Request) {
  const a = await marketingApi("ads_manage");
  if ("error" in a) return a.error;
  const { adCampaign, crmCampaign } = (await req.json().catch(() => ({}))) as { adCampaign?: string; crmCampaign?: string };
  if (!adCampaign?.trim()) return fail("Thiếu tên chiến dịch quảng cáo");
  return ok({ map: await setCampaignMapping(a.ctx.workspace.id, adCampaign, crmCampaign ?? "") });
}
