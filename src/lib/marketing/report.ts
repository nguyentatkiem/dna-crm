// Báo cáo hiệu quả quảng cáo: ghép chi phí (AdSpend) với lead và đơn thắng trong CRM theo tên chiến dịch.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db, parseJson } from "../db";
import { ai, MODEL } from "../ai";
import { wonLost } from "../metrics";
import { vnd } from "../format";
import type { WorkspaceConfig } from "../config/schema";
import { getCampaignMap, linkDealToContact, nameIndex } from "./store";
import { normCampaign, PROVIDER_LABEL } from "./shared";
import { providerOf } from "./ads";

export type CampaignRow = {
  key: string;
  provider: string;
  campaign: string;
  /** Tên chiến dịch QC gốc (để ghép thủ công). */
  adNames: string[];
  crmCampaign: string;
  mapped: "auto" | "manual" | "none";
  spend: number;
  impressions: number;
  clicks: number;
  platformLeads: number;
  leads: number;
  won: number;
  revenue: number;
  cplTrend: number | null;
};
export type DayPoint = { day: string; spend: number; revenue: number };
export type AdReport = {
  days: number;
  kpi: { spend: number; leads: number; platformLeads: number; cpl: number; won: number; revenue: number; roas: number; cac: number };
  daily: DayPoint[];
  rows: CampaignRow[];
  organic: { leads: number; won: number; revenue: number };
  crmCampaigns: string[];
  hasSpend: boolean;
  insights: string[];
};

const VN = 7 * 3600e3;
/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export const vnDay = (d: Date) => new Date(d.getTime() + VN).toISOString().slice(0, 10);

export async function buildAdReport(workspaceId: string, cfg: WorkspaceConfig, days: number, scope: Prisma.RecordWhereInput): Promise<AdReport> {
  const todayVn = vnDay(new Date());
  const startDay = new Date(Date.parse(`${todayVn}T00:00:00Z`) - (days - 1) * 864e5).toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${startDay}T00:00:00Z`) - VN);
  const [spends, contacts, deals, map] = await Promise.all([
    db.adSpend.findMany({ where: { workspaceId, date: { gte: new Date(`${startDay}T00:00:00Z`) } }, orderBy: { date: "asc" } }),
    db.record.findMany({ where: { ...scope, objectKey: "contacts", createdAt: { gte: since } }, select: { id: true, title: true, dataJson: true, createdAt: true } }),
    db.record.findMany({ where: { ...scope, objectKey: "deals" }, select: { id: true, title: true, dataJson: true, amount: true, status: true, createdAt: true } }),
    getCampaignMap(workspaceId),
  ]);
  const { won } = wonLost(cfg);

  const rows = new Map<string, CampaignRow & { half: [number, number, number, number] }>();
  const mid = Date.parse(`${startDay}T00:00:00Z`) + (days / 2) * 864e5;
  const newRow = (key: string, provider: string, campaign: string) => ({ key, provider, campaign, adNames: [], crmCampaign: "", mapped: "none" as const, spend: 0, impressions: 0, clicks: 0, platformLeads: 0, leads: 0, won: 0, revenue: 0, cplTrend: null, half: [0, 0, 0, 0] as [number, number, number, number] });

  const daily = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
    daily.set(d, { day: d, spend: 0, revenue: 0 });
  }

  for (const s of spends) {
    const adKey = normCampaign(s.campaign);
    const manual = map[adKey];
    const key = manual ? normCampaign(manual) : adKey;
    const r = rows.get(key) ?? newRow(key, s.provider, s.campaign);
    if (!rows.has(key)) rows.set(key, r);
    if (!r.adNames.includes(s.campaign)) r.adNames.push(s.campaign);
    if (manual) {
      r.mapped = "manual";
      r.crmCampaign = manual;
    }
    r.spend += s.spend;
    r.impressions += s.impressions;
    r.clicks += s.clicks;
    r.platformLeads += s.leads;
    const h = s.date.getTime() < mid ? 0 : 2;
    r.half[h] += s.spend;
    r.half[h + 1] += s.leads;
    const p = daily.get(s.date.toISOString().slice(0, 10));
    if (p) p.spend += s.spend;
  }

  // Khách → dòng chiến dịch. Không khớp chi phí nào: lead quảng cáo đứng riêng (chưa có chi phí), còn lại là tự nhiên.
  const spendKeys = [...rows.keys()];
  const rowOf = new Map<string, string | null>();
  const organic = { leads: 0, won: 0, revenue: 0 };
  const crmCampaigns = new Set<string>();
  const findKey = (camp: string) => {
    const k = normCampaign(camp);
    if (!k) return null;
    if (rows.has(k)) return k;
    return spendKeys.find((s) => k.length >= 4 && s.length >= 4 && (s.includes(k) || k.includes(s))) ?? null;
  };
  for (const c of contacts) {
    const d = parseJson<Record<string, string>>(c.dataJson, {});
    const camp = String(d._chien_dich ?? "").trim();
    if (camp) crmCampaigns.add(camp);
    let key = camp ? findKey(camp) : null;
    if (!key && (d._kenh === "ads" || camp)) {
      key = normCampaign(camp) || `src_${normCampaign(d._nguon || "khac")}`;
      if (!rows.has(key)) rows.set(key, newRow(key, providerOf(d._nguon || ""), camp || `${d._nguon || "Quảng cáo"} (không rõ chiến dịch)`));
    }
    rowOf.set(c.id, key);
    if (!key) {
      organic.leads++;
      continue;
    }
    const r = rows.get(key)!;
    r.leads++;
    if (camp && r.mapped !== "manual") {
      r.crmCampaign ||= camp;
      if (r.spend) r.mapped = "auto";
    }
  }

  const byName = nameIndex(contacts);
  for (const deal of deals) {
    if (!won.has(deal.status)) continue;
    const dd = parseJson<Record<string, string>>(deal.dataJson, {});
    let key: string | null | undefined;
    if (dd._chien_dich) key = findKey(dd._chien_dich);
    else {
      const c = linkDealToContact(deal, byName, cfg);
      if (c) key = rowOf.get(c.id);
      else if (deal.createdAt >= since && dd._kenh && dd._kenh !== "ads") key = null;
      else continue;
    }
    if (key === undefined) continue;
    if (key === null) {
      organic.won++;
      organic.revenue += deal.amount;
      continue;
    }
    const r = rows.get(key);
    if (!r) continue;
    r.won++;
    r.revenue += deal.amount;
    if (r.spend) {
      const p = daily.get(vnDay(deal.createdAt)) ?? daily.get(todayVn);
      if (p) p.revenue += deal.amount;
    }
  }

  const list = [...rows.values()].map(({ half, ...r }) => {
    const [s1, l1, s2, l2] = half;
    const trend = l1 && l2 && s1 && s2 ? (s2 / l2 - s1 / l1) / (s1 / l1) : null;
    return { ...r, provider: r.provider in PROVIDER_LABEL ? r.provider : "other", cplTrend: trend };
  });
  list.sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const paid = list.filter((r) => r.spend > 0);
  const spend = paid.reduce((s, r) => s + r.spend, 0);
  const leads = paid.reduce((s, r) => s + r.leads, 0);
  const wonN = paid.reduce((s, r) => s + r.won, 0);
  const revenue = paid.reduce((s, r) => s + r.revenue, 0);
  const report: AdReport = {
    days,
    kpi: { spend, leads, platformLeads: paid.reduce((s, r) => s + r.platformLeads, 0), cpl: leads ? spend / leads : 0, won: wonN, revenue, roas: spend ? revenue / spend : 0, cac: wonN ? spend / wonN : 0 },
    daily: [...daily.values()],
    rows: list,
    organic,
    crmCampaigns: [...crmCampaigns].sort(),
    hasSpend: spends.length > 0,
    insights: [],
  };
  report.insights = ruleInsights(report);
  return report;
}

const roasOf = (r: CampaignRow) => (r.spend ? r.revenue / r.spend : 0);
const cplOf = (r: CampaignRow) => (r.leads ? r.spend / r.leads : r.platformLeads ? r.spend / r.platformLeads : 0);

/** Nhận xét bằng luật khi chưa có AI: ROAS cao nhất, thấp nhất, CPL tăng. */
export function ruleInsights(rep: AdReport): string[] {
  const paid = rep.rows.filter((r) => r.spend > 0);
  if (!paid.length) return ["Chưa có chi phí quảng cáo trong khoảng này. Kết nối tài khoản quảng cáo hoặc nhập CSV để xem CPL và ROAS."];
  const out: string[] = [];
  const byRoas = [...paid].sort((a, b) => roasOf(b) - roasOf(a));
  const best = byRoas[0];
  const worst = byRoas[byRoas.length - 1];
  if (roasOf(best) >= 1) out.push(`Tăng ngân sách “${best.campaign}”: ROAS ${roasOf(best).toFixed(1)}x, mỗi 1đ quảng cáo mang về ${roasOf(best).toFixed(1)}đ doanh thu. Thử tăng 20–30% và theo dõi CPL.`);
  else out.push(`Chưa chiến dịch nào hoà vốn (ROAS cao nhất ${roasOf(best).toFixed(1)}x ở “${best.campaign}”). Xem lại chất lượng lead và kịch bản chốt trước khi tăng chi.`);
  if (worst !== best) {
    if (roasOf(worst) < 1) out.push(`Giảm hoặc tạm dừng “${worst.campaign}”: chi ${vnd(worst.spend)} nhưng ROAS chỉ ${roasOf(worst).toFixed(1)}x${worst.won ? "" : ", chưa có khách chốt"}. Đổi nội dung hoặc đối tượng trước khi chạy tiếp.`);
    else out.push(`“${worst.campaign}” có ROAS thấp nhất (${roasOf(worst).toFixed(1)}x): giữ ngân sách, tối ưu nội dung để kéo CPL xuống.`);
  }
  const rising = paid.filter((r) => r.cplTrend !== null && r.cplTrend > 0.25).sort((a, b) => (b.cplTrend ?? 0) - (a.cplTrend ?? 0))[0];
  if (rising) out.push(`CPL của “${rising.campaign}” tăng ${Math.round((rising.cplTrend ?? 0) * 100)}% ở nửa sau kỳ: quảng cáo có thể đã bão hoà, nên làm mới hình ảnh/video.`);
  else if (rep.organic.leads) out.push(`Lead tự nhiên: ${rep.organic.leads} lead, ${rep.organic.won} khách chốt không tốn tiền quảng cáo. Đầu tư thêm nội dung tự nhiên và giới thiệu.`);
  return out.slice(0, 3);
}

const InsightOut = z.object({ bullets: z.array(z.string()).min(1).max(3) });

/** Claude tóm tắt 3 gạch đầu dòng: chiến dịch nên tăng/giảm ngân sách. Trả null nếu không dùng được AI. */
export async function aiInsights(rep: AdReport, cfg: WorkspaceConfig): Promise<string[] | null> {
  const c = ai();
  if (!c || !rep.rows.some((r) => r.spend > 0)) return null;
  const table = rep.rows
    .map((r) => `- ${r.campaign} (${PROVIDER_LABEL[r.provider] ?? r.provider}): chi ${Math.round(r.spend)}đ, hiển thị ${r.impressions}, click ${r.clicks}, lead nền tảng ${r.platformLeads}, lead CRM ${r.leads}, CPL ${Math.round(cplOf(r))}đ, chốt ${r.won}, doanh thu ${Math.round(r.revenue)}đ, ROAS ${roasOf(r).toFixed(2)}, CPL nửa sau so với nửa đầu ${r.cplTrend === null ? "không rõ" : Math.round(r.cplTrend * 100) + "%"}`)
    .join("\n");
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: "low", format: zodOutputFormat(InsightOut) },
      system: `Bạn là chuyên gia quảng cáo cho doanh nghiệp nhỏ Việt Nam (${cfg.businessName}, ngành ${cfg.industry}). Viết đúng 3 gạch đầu dòng tiếng Việt, mỗi dòng 1–2 câu, cụ thể theo tên chiến dịch: nên tăng/giảm/giữ ngân sách bao nhiêu và vì sao, dựa trên ROAS, CPL, tỉ lệ chốt. Không bịa số liệu ngoài bảng.`,
      messages: [{ role: "user", content: `${rep.days} ngày qua. Tổng chi ${Math.round(rep.kpi.spend)}đ, ROAS ${rep.kpi.roas.toFixed(2)}, CAC ${Math.round(rep.kpi.cac)}đ. Lead tự nhiên: ${rep.organic.leads} lead, ${rep.organic.won} chốt, ${Math.round(rep.organic.revenue)}đ.\n\nTheo chiến dịch:\n${table}` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return res.parsed_output.bullets.slice(0, 3);
  } catch (e) {
    console.error("[Marketing Analyst] dùng nhận xét luật vì AI lỗi:", e instanceof Error ? e.message : e);
    return null;
  }
}
