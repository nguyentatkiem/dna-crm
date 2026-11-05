// Kéo chi phí quảng cáo từ Facebook / Google Ads, nhập tay và nhập CSV (TikTok, Zalo Ads, nền tảng khác).
import { db } from "../db";
import { parseTable } from "../csv";
import { getSettings, type Integrations } from "../settings";
import { normCampaign } from "./shared";

export type SpendRow = { date: string; provider: string; accountId?: string; campaignId?: string; campaign: string; spend: number; impressions?: number; clicks?: number; leads?: number };
export type SyncResult = { provider: "facebook" | "google"; ok: boolean; rows: number; error?: string };

const AGENT = "Marketing Analyst";

/** Ngày "YYYY-MM-DD" → Date 00:00 UTC; mọi AdSpend lưu cùng một mốc để khoá unique theo ngày không bị lệch. */
export const dayDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export async function upsertSpend(workspaceId: string, rows: SpendRow[], source: "api" | "manual" | "csv" | "sample") {
  let n = 0;
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !r.campaign.trim()) continue;
    const campaignId = r.campaignId || normCampaign(r.campaign) || "khong_ten";
    const data = {
      campaign: r.campaign.trim().slice(0, 200),
      accountId: r.accountId ?? "",
      spend: Math.max(0, Math.round(r.spend || 0)),
      impressions: Math.max(0, Math.round(r.impressions || 0)),
      clicks: Math.max(0, Math.round(r.clicks || 0)),
      leads: Math.max(0, Math.round(r.leads || 0)),
      source,
    };
    await db.adSpend.upsert({
      where: { workspaceId_provider_campaignId_date: { workspaceId, provider: r.provider, campaignId, date: dayDate(r.date) } },
      create: { workspaceId, provider: r.provider, campaignId, date: dayDate(r.date), ...data },
      update: data,
    });
    n++;
  }
  return n;
}

// ---------------- Facebook Marketing API ----------------

async function syncFacebook(workspaceId: string, s: Integrations): Promise<SyncResult> {
  const { accessToken, adAccountId } = s.fbAds ?? {};
  if (!accessToken || !adAccountId) return { provider: "facebook", ok: false, rows: 0, error: "Chưa nhập Access Token hoặc Ad Account ID" };
  const acc = adAccountId.replace(/^act_/, "").trim();
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    date_preset: "last_30d",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
    limit: "500",
  });
  let url: string | undefined = `https://graph.facebook.com/v23.0/act_${acc}/insights?${params}`;
  const rows: SpendRow[] = [];
  type Ins = { campaign_id: string; campaign_name: string; spend?: string; impressions?: string; clicks?: string; date_start: string; actions?: { action_type: string; value: string }[] };
  for (let page = 0; url && page < 30; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = (await res.json().catch(() => ({}))) as { data?: Ins[]; paging?: { next?: string }; error?: { message: string; code: number } };
    if (j.error || !res.ok) throw new Error(`Facebook báo lỗi ${j.error?.code ?? res.status}: ${j.error?.message ?? "không rõ"}`);
    for (const d of j.data ?? []) {
      const lead = (d.actions ?? []).filter((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      // Facebook có thể trả cả hai loại cho cùng lead: lấy giá trị lớn nhất thay vì cộng dồn.
      const leads = lead.reduce((m, a) => Math.max(m, Number(a.value) || 0), 0);
      rows.push({ date: d.date_start, provider: "facebook", accountId: acc, campaignId: d.campaign_id, campaign: d.campaign_name, spend: Number(d.spend) || 0, impressions: Number(d.impressions) || 0, clicks: Number(d.clicks) || 0, leads });
    }
    url = j.paging?.next;
  }
  return { provider: "facebook", ok: true, rows: await upsertSpend(workspaceId, rows, "api") };
}

// ---------------- Google Ads API ----------------
// Lưu ý: Google Ads API đổi phiên bản vài tháng một lần (v21 tại thời điểm viết). Khi Google ngừng hỗ trợ v21,
// đổi số phiên bản trong URL bên dưới (xem developers.google.com/google-ads/api/docs/sunset-dates).
const GOOGLE_ADS_VERSION = "v21";

async function syncGoogle(workspaceId: string, s: Integrations): Promise<SyncResult> {
  const g = s.googleAds ?? {};
  if (!g.developerToken || !g.clientId || !g.clientSecret || !g.refreshToken || !g.customerId) return { provider: "google", ok: false, rows: 0, error: "Thiếu một trong các khoá: Developer token, Client ID, Client secret, Refresh token, Customer ID" };
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: "refresh_token" }),
  });
  const tj = (await tok.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!tj.access_token) throw new Error(`Google không cấp access token: ${tj.error_description ?? tj.error ?? tok.status}`);
  const cid = g.customerId.replace(/\D/g, "");
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${tj.access_token}`, "developer-token": g.developerToken };
  if (g.loginCustomerId) headers["login-customer-id"] = g.loginCustomerId.replace(/\D/g, "");
  const query = "SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS";
  const res = await fetch(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${cid}/googleAds:searchStream`, { method: "POST", headers, body: JSON.stringify({ query }) });
  type Row = { campaign?: { id?: string; name?: string }; segments?: { date?: string }; metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number } };
  const j = (await res.json().catch(() => null)) as { results?: Row[] }[] | { error?: { message?: string; code?: number } } | null;
  if (!res.ok || !Array.isArray(j)) {
    const err = j && !Array.isArray(j) ? j.error : undefined;
    throw new Error(`Google Ads báo lỗi ${err?.code ?? res.status}: ${err?.message ?? "không rõ"}`);
  }
  const rows: SpendRow[] = [];
  for (const chunk of j)
    for (const r of chunk.results ?? []) {
      if (!r.segments?.date || !r.campaign?.id) continue;
      rows.push({
        date: r.segments.date,
        provider: "google",
        accountId: cid,
        campaignId: r.campaign.id,
        campaign: r.campaign.name ?? r.campaign.id,
        spend: (Number(r.metrics?.costMicros) || 0) / 1e6,
        impressions: Number(r.metrics?.impressions) || 0,
        clicks: Number(r.metrics?.clicks) || 0,
        leads: Math.round(Number(r.metrics?.conversions) || 0),
      });
    }
  return { provider: "google", ok: true, rows: await upsertSpend(workspaceId, rows, "api") };
}

/** Đồng bộ một workspace, trả kết quả từng nền tảng cho nút "Đồng bộ ngay". Lỗi ghi vào nhật ký AI agent. */
export async function syncWorkspaceAds(workspaceId: string): Promise<SyncResult[]> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return [];
  const s = getSettings(ws);
  const out: SyncResult[] = [];
  const jobs: [boolean, "facebook" | "google", () => Promise<SyncResult>][] = [
    [!!(s.fbAds?.accessToken || s.fbAds?.adAccountId), "facebook", () => syncFacebook(workspaceId, s)],
    [!!(s.googleAds?.developerToken || s.googleAds?.refreshToken), "google", () => syncGoogle(workspaceId, s)],
  ];
  for (const [on, provider, run] of jobs) {
    if (!on) continue;
    let r: SyncResult;
    try {
      r = await run();
    } catch (e) {
      r = { provider, ok: false, rows: 0, error: e instanceof Error ? e.message : String(e) };
    }
    out.push(r);
    const label = provider === "facebook" ? "Facebook Ads" : "Google Ads";
    await db.agentLog.create({ data: { workspaceId, agent: AGENT, message: r.ok ? `Đồng bộ chi phí ${label}: ${r.rows} dòng (30 ngày)` : `Lỗi đồng bộ ${label}: ${r.error}` } });
  }
  return out;
}

export async function syncAdSpend(workspaceId?: string): Promise<void> {
  const list = workspaceId
    ? [{ id: workspaceId }]
    : await db.workspace.findMany({ where: { OR: [{ settingsJson: { contains: '"fbAds"' } }, { settingsJson: { contains: '"googleAds"' } }] }, select: { id: true } });
  for (const w of list) await syncWorkspaceAds(w.id).catch((e) => console.error("[ads]", e instanceof Error ? e.message : e));
}

// ---------------- Nhập CSV / nhập tay ----------------

export function providerOf(s: string) {
  const n = normCampaign(s);
  if (!n) return "other";
  if (n.includes("facebook") || n === "fb" || n.includes("meta") || n.includes("instagram")) return "facebook";
  if (n.includes("google") || n.includes("youtube") || n === "gg") return "google";
  if (n.includes("tiktok")) return "tiktok";
  if (n.includes("zalo")) return "zalo";
  return n.slice(0, 30);
}

/** Ngày dạng 31/10/2026, 31-10-2026 hoặc 2026-10-31 → "2026-10-31". */
export function parseDay(s: string) {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

/** Số kiểu Việt Nam: "1.500.000", "1,500,000 đ", "1500000" → 1500000. Bỏ phần thập phân. */
export function parseNum(s: string) {
  const t = String(s ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  // "12,5" hoặc "12.5" với 1–2 chữ số sau dấu: coi là thập phân; còn lại dấu là phân cách nghìn.
  const dec = t.match(/^(-?\d+)[.,](\d{1,2})$/);
  if (dec) return Number(`${dec[1]}.${dec[2]}`);
  return Number(t.replace(/[.,]/g, "")) || 0;
}

const COLS: [keyof SpendRow | "platform", string[]][] = [
  ["date", ["ngay", "date", "day"]],
  ["platform", ["nentang", "platform", "kenh", "provider"]],
  ["campaign", ["chiendich", "campaign", "campaignname"]],
  ["spend", ["chiphi", "spend", "cost", "amountspent", "sotiendachitieu"]],
  ["impressions", ["hienthi", "impressions", "luothienthi", "impr"]],
  ["clicks", ["click", "clicks", "luotclick", "luotnhap"]],
  ["leads", ["lead", "leads", "khachtiemnang", "results", "ketqua"]],
];

export function parseSpendCsv(text: string): { rows: SpendRow[]; errors: string[] } {
  const table = parseTable(text);
  if (table.length < 2) return { rows: [], errors: ["File cần dòng tiêu đề và ít nhất một dòng dữ liệu"] };
  const head = table[0].map((h) => normCampaign(h));
  const idx = Object.fromEntries(COLS.map(([k, names]) => [k, head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)))])) as Record<string, number>;
  const errors: string[] = [];
  for (const k of ["date", "campaign", "spend"]) if (idx[k] < 0) errors.push(`Thiếu cột ${k === "date" ? "ngày" : k === "campaign" ? "chiến dịch" : "chi phí"}`);
  if (errors.length) return { rows: [], errors };
  const rows: SpendRow[] = [];
  table.slice(1).forEach((r, i) => {
    const date = parseDay(r[idx.date] ?? "");
    const campaign = (r[idx.campaign] ?? "").trim();
    if (!date || !campaign) {
      errors.push(`Dòng ${i + 2}: thiếu ngày hoặc chiến dịch`);
      return;
    }
    const get = (k: string) => (idx[k] >= 0 ? parseNum(r[idx[k]] ?? "") : 0);
    rows.push({ date, provider: idx.platform >= 0 ? providerOf(r[idx.platform] ?? "") : "other", campaign, spend: get("spend"), impressions: get("impressions"), clicks: get("clicks"), leads: get("leads") });
  });
  return { rows, errors: errors.slice(0, 10) };
}
