"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/Icon";
import { vnd } from "@/lib/format";
import type { AdReport, CampaignRow } from "@/lib/marketing/report";
import { PROVIDER_COLOR, PROVIDER_LABEL } from "@/lib/marketing/shared";
import { Drawer, SecretField, Steps } from "./Drawer";

const AdsDailyChart = dynamic(() => import("./AdsDailyChart").then((m) => m.AdsDailyChart), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface-2" /> });

type Masked = { fbAds: Record<string, string>; googleAds: Record<string, string> };
type Props = { report: AdReport; manage: boolean; aiOn: boolean; masked: Masked; lastSync: { at: string; text: string } | null };

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : "–");
const roasOf = (r: Pick<CampaignRow, "spend" | "revenue">) => (r.spend ? r.revenue / r.spend : 0);
const cplOf = (r: Pick<CampaignRow, "spend" | "leads">) => (r.leads ? r.spend / r.leads : 0);
const roasTone = (x: number) => (x < 1 ? "bg-danger-soft text-danger" : x <= 3 ? "bg-warning-soft text-warning" : "bg-success-soft text-success");

type SortKey = "campaign" | "spend" | "impressions" | "clicks" | "ctr" | "platformLeads" | "leads" | "cpl" | "close" | "revenue" | "roas";
const COLS: [SortKey, string][] = [
  ["campaign", "Chiến dịch"],
  ["spend", "Chi"],
  ["impressions", "Hiển thị"],
  ["clicks", "Click"],
  ["ctr", "CTR"],
  ["platformLeads", "Lead nền tảng báo"],
  ["leads", "Lead về CRM"],
  ["cpl", "CPL"],
  ["close", "Tỉ lệ chốt"],
  ["revenue", "Doanh thu"],
  ["roas", "ROAS"],
];
const val = (r: CampaignRow, k: SortKey): number | string =>
  k === "campaign" ? r.campaign : k === "ctr" ? (r.impressions ? r.clicks / r.impressions : 0) : k === "cpl" ? cplOf(r) : k === "close" ? (r.leads ? r.won / r.leads : 0) : k === "roas" ? roasOf(r) : r[k];

export function AdsTab({ report, manage, aiOn, masked, lastSync }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<[SortKey, 1 | -1]>(["spend", -1]);
  const [open, setOpen] = useState<null | "connect" | "csv" | "manual">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [insights, setInsights] = useState<{ bullets: string[]; source: "ai" | "rules" | "loading" }>({ bullets: report.insights, source: aiOn && report.hasSpend ? "loading" : "rules" });
  const k = report.kpi;

  useEffect(() => {
    setInsights({ bullets: report.insights, source: aiOn && report.hasSpend ? "loading" : "rules" });
    if (!aiOn || !report.hasSpend) return;
    let live = true;
    fetch("/api/marketing/ads/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: report.days }) })
      .then((r) => r.json())
      .then((j) => live && j.bullets && setInsights({ bullets: j.bullets, source: j.source }))
      .catch(() => live && setInsights((s) => ({ ...s, source: "rules" })));
    return () => {
      live = false;
    };
  }, [report, aiOn]);

  const rows = useMemo(() => {
    const [key, dir] = sort;
    return [...report.rows].sort((a, b) => {
      const x = val(a, key);
      const y = val(b, key);
      return (typeof x === "string" ? x.localeCompare(String(y), "vi") : x - (y as number)) * dir;
    });
  }, [report.rows, sort]);

  async function sync() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/marketing/ads/sync", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    const res = j.results as { provider: string; ok: boolean; rows: number; error?: string }[];
    setMsg({ ok: res.every((x) => x.ok), text: res.map((x) => `${PROVIDER_LABEL[x.provider]}: ${x.ok ? `đã kéo ${x.rows} dòng` : x.error}`).join(" · ") });
    router.refresh();
  }

  async function mapCampaign(adCampaign: string, crmCampaign: string) {
    const r = await fetch("/api/marketing/ads/map", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adCampaign, crmCampaign }) });
    if (!r.ok) setMsg({ ok: false, text: (await r.json()).error });
    router.refresh();
  }

  const kpis: [string, string, string][] = [
    ["Tổng chi", vnd(k.spend), `${report.days} ngày qua`],
    ["Lead", String(k.leads), `nền tảng báo ${k.platformLeads}`],
    ["CPL", k.cpl ? vnd(k.cpl) : "–", "chi phí / lead về CRM"],
    ["Khách chốt", String(k.won), pct(k.won, k.leads) + " lead quảng cáo"],
    ["Doanh thu", vnd(k.revenue), "từ khách quảng cáo"],
    ["ROAS", k.spend ? `${k.roas.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}x` : "–", "doanh thu / chi phí"],
    ["CAC", k.cac ? vnd(k.cac) : "–", "chi phí / khách chốt"],
  ];

  return (
    <div className="mt-5 grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-line p-0.5" role="group" aria-label="Khoảng ngày">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/w/marketing?tab=ads&days=${d}`} className={`rounded px-3 py-1 text-[13.5px] ${report.days === d ? "bg-primary text-white" : "text-ink hover:bg-hover"}`}>
              {d} ngày
            </Link>
          ))}
        </div>
        <span className="flex-1" />
        {manage && (
          <>
            <button type="button" className="btn-outline" onClick={() => setOpen("manual")}>
              <Icon name="plus" size={16} /> Nhập tay
            </button>
            <button type="button" className="btn-outline" onClick={() => setOpen("csv")}>
              <Icon name="upload" size={16} /> Nhập CSV
            </button>
            <button type="button" className="btn-outline" onClick={sync} disabled={busy}>
              <Icon name="refresh" size={16} /> {busy ? "Đang đồng bộ…" : "Đồng bộ ngay"}
            </button>
            <button type="button" className="btn-primary" onClick={() => setOpen("connect")}>
              <Icon name="link" size={16} /> Kết nối tài khoản quảng cáo
            </button>
          </>
        )}
      </div>
      {(msg || lastSync) && (
        <p className={`rounded px-3 py-2 text-[13px] ${msg ? (msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger") : "bg-surface-2 text-ink-2"}`} role="status">
          {msg ? msg.text : `Lần đồng bộ gần nhất ${lastSync!.at}: ${lastSync!.text}`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {kpis.map(([label, v, hint]) => (
          <div key={label} className="card min-w-0 p-3.5">
            <span className="label">{label}</span>
            <b className={`tnum mt-1 block truncate text-[22px] font-semibold ${label === "ROAS" && k.spend ? (k.roas < 1 ? "text-danger" : k.roas <= 3 ? "text-warning" : "text-success") : ""}`}>{v}</b>
            <span className="block truncate text-[12px] text-ink-2">{hint}</span>
          </div>
        ))}
      </div>

      {!report.hasSpend && (
        <section className="card grid gap-3 p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-selected text-primary">
            <Icon name="megaphone" />
          </span>
          <h2 className="text-[17px] font-semibold">Chưa có chi phí quảng cáo trong {report.days} ngày</h2>
          <p className="mx-auto max-w-xl text-[14px] text-ink-2">Kết nối Facebook Ads hoặc Google Ads để tự kéo chi phí mỗi 6 giờ. TikTok, Zalo Ads và nền tảng khác: xuất báo cáo ra CSV rồi bấm “Nhập CSV”. CRM sẽ ghép với lead theo tên chiến dịch để tính CPL, ROAS.</p>
          {manage && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => setOpen("connect")}>
                Kết nối tài khoản
              </button>
              <button type="button" className="btn-outline" onClick={() => setOpen("csv")}>
                Nhập CSV
              </button>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card min-w-0 p-4">
          <h2 className="text-[16px] font-semibold">Chi phí và doanh thu theo ngày</h2>
          <div className="mt-3 h-[260px]">
            <AdsDailyChart daily={report.daily} />
          </div>
        </section>
        <section className="card min-w-0 p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-selected text-primary">
              <Icon name="spark" size={16} />
            </span>
            <h2 className="flex-1 text-[16px] font-semibold">Marketing Analyst nhận xét</h2>
            <span className="text-[11.5px] text-ink-2">{insights.source === "ai" ? "Claude" : insights.source === "loading" ? "Đang hỏi Claude…" : "Theo luật"}</span>
          </div>
          <ul className="mt-3 grid gap-2.5 text-[13.5px]">
            {insights.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                <span className="min-w-0">{b}</span>
              </li>
            ))}
          </ul>
          {!aiOn && <p className="mt-3 text-[12px] text-ink-2">Thêm ANTHROPIC_API_KEY để Claude phân tích sâu hơn theo ngữ cảnh.</p>}
        </section>
      </div>

      <section className="card min-w-0 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold">Theo chiến dịch</h2>
          <span className="text-[12.5px] text-ink-2">Ghép theo tên chiến dịch của lead (_chien_dich). Chưa khớp? Chọn tay ở cột chiến dịch.</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[13.5px]">
            <thead className="text-left text-[12.5px] text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 pr-2 font-medium">Nền tảng</th>
                {COLS.map(([key, label]) => (
                  <th key={key} className={`py-2 font-medium ${key === "campaign" ? "" : "text-right"}`} aria-sort={sort[0] === key ? (sort[1] === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort(([s, d]) => [key, s === key ? ((-d) as 1 | -1) : key === "campaign" ? 1 : -1])}>
                      {label}
                      {sort[0] === key && <span aria-hidden="true">{sort[1] === 1 ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--line-soft)] align-top">
                  <td className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PROVIDER_COLOR[r.provider] ?? "#676879" }} />
                      {PROVIDER_LABEL[r.provider] ?? r.provider}
                    </span>
                  </td>
                  <td className="max-w-[260px] py-2">
                    <b className="block truncate font-medium" title={r.campaign}>
                      {r.campaign}
                    </b>
                    {r.spend > 0 ? (
                      r.mapped === "none" ? (
                        manage && report.crmCampaigns.length ? (
                          <select className="mt-1 h-7 max-w-full rounded border border-line bg-surface px-1 text-[12px] text-ink" defaultValue="" onChange={(e) => e.target.value && mapCampaign(r.adNames[0], e.target.value)} aria-label={`Ghép ${r.campaign} với chiến dịch trong CRM`}>
                            <option value="">Chưa khớp lead · ghép với…</option>
                            {report.crmCampaigns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[12px] text-warning">Chưa khớp lead nào</span>
                        )
                      ) : r.mapped === "manual" ? (
                        <span className="text-[12px] text-ink-2">
                          Ghép tay với “{r.crmCampaign}”{" "}
                          {manage && (
                            <button type="button" className="text-primary hover:underline" onClick={() => mapCampaign(r.adNames[0], "")}>
                              bỏ ghép
                            </button>
                          )}
                        </span>
                      ) : null
                    ) : (
                      <span className="text-[12px] text-ink-2">Có lead nhưng chưa có chi phí</span>
                    )}
                  </td>
                  <td className="tnum py-2 text-right">{r.spend ? vnd(r.spend) : "–"}</td>
                  <td className="tnum py-2 text-right">{r.impressions ? r.impressions.toLocaleString("vi-VN") : "–"}</td>
                  <td className="tnum py-2 text-right">{r.clicks ? r.clicks.toLocaleString("vi-VN") : "–"}</td>
                  <td className="tnum py-2 text-right">{pct(r.clicks, r.impressions)}</td>
                  <td className="tnum py-2 text-right">{r.platformLeads || "–"}</td>
                  <td className="tnum py-2 text-right">{r.leads}</td>
                  <td className="tnum py-2 text-right">
                    {r.leads && r.spend ? vnd(cplOf(r)) : "–"}
                    {r.cplTrend !== null && r.cplTrend > 0.25 && <span className="block text-[11.5px] text-danger">↑ {Math.round(r.cplTrend * 100)}%</span>}
                  </td>
                  <td className="tnum py-2 text-right">{pct(r.won, r.leads)}</td>
                  <td className="tnum py-2 text-right">{r.revenue ? vnd(r.revenue) : "–"}</td>
                  <td className="py-2 text-right">{r.spend ? <span className={`tnum inline-flex rounded px-2 py-0.5 text-[12.5px] font-semibold ${roasTone(roasOf(r))}`}>{roasOf(r).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x</span> : "–"}</td>
                </tr>
              ))}
              <tr className="bg-surface-2">
                <td className="py-2.5 pr-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#00c875]" /> Tự nhiên
                  </span>
                </td>
                <td className="py-2.5">
                  <b className="font-medium">Lead tự nhiên (không tốn tiền)</b>
                  <span className="block text-[12px] text-ink-2">Zalo OA, SEO, website, giới thiệu, sàn TMĐT</span>
                </td>
                <td className="tnum text-right">0đ</td>
                <td className="text-right">–</td>
                <td className="text-right">–</td>
                <td className="text-right">–</td>
                <td className="text-right">–</td>
                <td className="tnum text-right">{report.organic.leads}</td>
                <td className="tnum text-right">0đ</td>
                <td className="tnum text-right">{pct(report.organic.won, report.organic.leads)}</td>
                <td className="tnum text-right">{report.organic.revenue ? vnd(report.organic.revenue) : "–"}</td>
                <td className="text-right text-ink-2">∞</td>
              </tr>
              {!rows.length && (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-ink-2">
                    Chưa có chiến dịch nào trong khoảng này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink-2">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger" />ROAS &lt; 1: lỗ</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warning" />1–3: hoà vốn tới lãi mỏng</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />&gt; 3: nên tăng ngân sách</span>
        </p>
      </section>

      {open === "connect" && <ConnectDrawer masked={masked} onClose={() => setOpen(null)} />}
      {open === "csv" && <CsvDrawer onClose={() => setOpen(null)} />}
      {open === "manual" && <ManualDrawer campaigns={[...new Set([...report.rows.map((r) => r.campaign), ...report.crmCampaigns])]} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ---------------- Kết nối tài khoản quảng cáo ----------------

const GOOGLE_FIELDS: [string, string, boolean, string][] = [
  ["developerToken", "Developer token", true, "Google Ads → Công cụ → Trung tâm API"],
  ["clientId", "OAuth Client ID", false, "Google Cloud Console → Thông tin xác thực"],
  ["clientSecret", "OAuth Client secret", true, ""],
  ["refreshToken", "Refresh token", true, "Lấy bằng OAuth Playground (bước 4)"],
  ["customerId", "Customer ID (tài khoản chạy QC)", false, "Dạng 123-456-7890, góc trên bên phải Google Ads"],
  ["loginCustomerId", "Login customer ID (MCC, nếu có)", false, "Chỉ điền khi truy cập qua tài khoản người quản lý"],
];

function ConnectDrawer({ masked, onClose }: { masked: Masked; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"fbAds" | "googleAds">("fbAds");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(masked);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => setVals((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/marketing/ads/connect", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: tab, values: vals }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setSaved((s) => ({ ...s, [tab]: j.masked }));
    setVals({});
    setMsg({ ok: true, text: "Đã lưu khoá. Bấm “Đồng bộ ngay” để kéo chi phí 30 ngày." });
    router.refresh();
  }

  return (
    <Drawer
      title="Kết nối tài khoản quảng cáo"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !Object.values(vals).some((v) => v.trim())}>
            {busy ? "Đang lưu…" : "Lưu khoá"}
          </button>
          {msg && <span className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </>
      }
    >
      <div className="flex gap-1 rounded border border-line p-0.5" role="tablist">
        {(["fbAds", "googleAds"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`flex-1 rounded px-3 py-1.5 text-[13.5px] ${tab === k ? "bg-primary text-white" : "hover:bg-hover"}`}
            onClick={() => {
              setTab(k);
              setVals({});
              setMsg(null);
            }}
          >
            {k === "fbAds" ? "Facebook Ads" : "Google Ads"} {Object.keys(saved[k]).length > 0 && "✓"}
          </button>
        ))}
      </div>
      {tab === "fbAds" ? (
        <>
          <Steps
            items={[
              <>Vào <b>business.facebook.com</b> → Cài đặt doanh nghiệp → Người dùng → <b>Người dùng hệ thống</b> → Thêm (vai trò Quản trị viên).</>,
              <>Bấm <b>Thêm tài sản</b> → Tài khoản quảng cáo → chọn tài khoản → bật quyền <b>Xem hiệu quả</b>.</>,
              <>Bấm <b>Tạo mã mới</b>, chọn ứng dụng của bạn, tích quyền <b>ads_read</b>, chọn “Không bao giờ hết hạn” → sao chép mã.</>,
              <>Ad Account ID: vào Trình quản lý quảng cáo, số sau <b>act=</b> trên thanh địa chỉ (chỉ cần dãy số).</>,
            ]}
          />
          <SecretField label="Access token (người dùng hệ thống)" value={vals.accessToken ?? ""} saved={saved.fbAds.accessToken} onChange={set("accessToken")} />
          <SecretField label="Ad Account ID" value={vals.adAccountId ?? ""} saved={saved.fbAds.adAccountId} onChange={set("adAccountId")} secret={false} placeholder="Ví dụ 1234567890" />
        </>
      ) : (
        <>
          <Steps
            items={[
              <>Đăng nhập Google Ads (nên là tài khoản người quản lý MCC) → Công cụ → <b>Trung tâm API</b> → xin <b>Developer token</b> (cấp “Basic” để đọc dữ liệu thật).</>,
              <>Vào <b>console.cloud.google.com</b> → tạo dự án → bật <b>Google Ads API</b> → Thông tin xác thực → Tạo <b>OAuth client ID</b> loại “Ứng dụng web”, thêm URI chuyển hướng https://developers.google.com/oauthplayground.</>,
              <>Mở <b>OAuth 2.0 Playground</b> → bánh răng → tích “Use your own OAuth credentials”, dán Client ID/Secret.</>,
              <>Ô scope nhập <b>https://www.googleapis.com/auth/adwords</b> → Authorize → Exchange authorization code → sao chép <b>Refresh token</b>.</>,
              <>Customer ID là số tài khoản chạy quảng cáo (có thể giữ dấu gạch). Truy cập qua MCC thì điền thêm Login customer ID là số MCC.</>,
            ]}
          />
          {GOOGLE_FIELDS.map(([key, label, secret, hint]) => (
            <SecretField key={key} label={label} value={vals[key] ?? ""} saved={saved.googleAds[key]} onChange={set(key)} secret={secret} hint={hint} />
          ))}
        </>
      )}
      <p className="rounded bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">Khoá chỉ lưu trên máy chủ của bạn, trình duyệt chỉ thấy 4 ký tự cuối. CRM tự kéo chi phí mỗi 6 giờ; lỗi sẽ hiện ở đây và trong nhật ký AI agent.</p>
    </Drawer>
  );
}

// ---------------- Nhập CSV ----------------

const SAMPLE_CSV = "ngày,nền tảng,chiến dịch,chi phí,hiển thị,click,lead\n01/11/2026,TikTok,Video review,350000,12000,110,2\n02/11/2026,TikTok,Video review,420000,15100,131,1";

function CsvDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/marketing/ads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setMsg({ ok: true, text: `Đã nhập ${j.rows} dòng.${j.errors?.length ? ` Bỏ qua: ${j.errors.join("; ")}` : ""}` });
    router.refresh();
  }

  return (
    <Drawer
      title="Nhập chi phí từ CSV"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? "Đang nhập…" : "Nhập"}
          </button>
          {msg && <span className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </>
      }
    >
      <p className="text-[13.5px] text-ink-2">
        Dùng cho TikTok Ads, Zalo Ads, Cốc Cốc… hoặc khi chưa kết nối API. Cột cần có: <b>ngày, nền tảng, chiến dịch, chi phí</b>; thêm <b>hiển thị, click, lead</b> nếu có. Cùng ngày + nền tảng + chiến dịch sẽ ghi đè dòng cũ. Có thể dán thẳng từ Excel.
      </p>
      <label className="grid gap-1">
        <span className="label">Chọn file .csv</span>
        <input
          type="file"
          accept=".csv,text/csv,.txt"
          className="text-[13px]"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
      </label>
      <label className="grid gap-1">
        <span className="label">Hoặc dán nội dung</span>
        <textarea className="textarea min-h-[200px] font-mono text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE_CSV} />
      </label>
      <button type="button" className="btn-ghost w-fit" onClick={() => setText(SAMPLE_CSV)}>
        <Icon name="doc" size={16} /> Điền ví dụ
      </button>
    </Drawer>
  );
}

// ---------------- Nhập tay ----------------

function ManualDrawer({ campaigns, onClose }: { campaigns: string[]; onClose: () => void }) {
  const router = useRouter();
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const [f, setF] = useState({ date: today, provider: "facebook", campaign: campaigns[0] ?? "", spend: "", impressions: "", clicks: "", leads: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit() {
    setMsg(null);
    const num = (s: string) => Number(s.replace(/\D/g, "")) || 0;
    const r = await fetch("/api/marketing/ads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, spend: num(f.spend), impressions: num(f.impressions), clicks: num(f.clicks), leads: num(f.leads) }) });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error });
    setMsg({ ok: true, text: "Đã lưu. Có thể nhập tiếp ngày khác." });
    setF((s) => ({ ...s, spend: "", impressions: "", clicks: "", leads: "" }));
    router.refresh();
  }

  return (
    <Drawer
      title="Nhập tay chi phí"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-primary" onClick={submit} disabled={!f.campaign.trim() || !f.spend}>
            Lưu
          </button>
          {msg && <span className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="label">Ngày</span>
          <input type="date" className="input" value={f.date} onChange={set("date")} />
        </label>
        <label className="grid gap-1">
          <span className="label">Nền tảng</span>
          <select className="input" value={f.provider} onChange={set("provider")}>
            {Object.entries(PROVIDER_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1">
        <span className="label">Chiến dịch</span>
        <input className="input" list="mkt-campaigns" value={f.campaign} onChange={set("campaign")} placeholder="Nên trùng tên chiến dịch gắn trên lead" />
        <datalist id="mkt-campaigns">
          {campaigns.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["spend", "Chi phí (đ)"],
            ["impressions", "Hiển thị"],
            ["clicks", "Click"],
            ["leads", "Lead nền tảng báo"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="grid gap-1">
            <span className="label">{label}</span>
            <input className="input tnum" inputMode="numeric" value={f[k]} onChange={set(k)} />
          </label>
        ))}
      </div>
    </Drawer>
  );
}
