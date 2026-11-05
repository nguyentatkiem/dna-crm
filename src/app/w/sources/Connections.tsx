"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

type P = { key: string; label: string; channel: string; guide: string; secrets: [string, string][] };
type Stat = { count: number; last: string; lastError: string };

const GROUPS: [string, string, string[]][] = [
  ["Quảng cáo", "Lead từ form quảng cáo đổ thẳng vào CRM, gắn chiến dịch.", ["facebook", "google", "tiktok"]],
  ["Zalo & tự nhiên", "Khách quan tâm OA, nhắn tin, gửi thông tin; form website, landing page, SEO.", ["zalo", "webhook"]],
  ["Thương mại điện tử", "Đơn hàng thành mục bán hàng, doanh thu tính theo kênh.", ["shopify", "haravan", "sapo", "woocommerce", "shopee", "lazada", "tiktokshop"]],
];
const BADGE: Record<string, [string, string]> = {
  facebook: ["f", "#1877f2"],
  google: ["G", "#ea4335"],
  tiktok: ["♪", "#111111"],
  zalo: ["Z", "#0068ff"],
  webhook: ["</>", "#a25ddc"],
  shopify: ["S", "#5e8e3e"],
  haravan: ["H", "#1a73e8"],
  sapo: ["S", "#0fd186"],
  woocommerce: ["W", "#7f54b3"],
  shopee: ["S", "#ee4d2d"],
  lazada: ["L", "#0f146d"],
  tiktokshop: ["T", "#fe2c55"],
  call: ["☎", "#0086c0"],
};

export function Connections({ providers, stats, base, masked, owner, formUrl }: { providers: P[]; stats: Record<string, Stat>; base: string; masked: Record<string, Record<string, string>>; owner: boolean; formUrl: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const call: P = {
    key: "call",
    label: "Tổng đài (Stringee, OMICall, VoIP24h...)",
    channel: "call",
    guide:
      "Khai báo URL bên dưới làm Event URL / Webhook khi kết thúc cuộc gọi trên tổng đài. CRM nhận số gọi, thời lượng, link ghi âm; tự khớp khách theo SĐT, tải ghi âm về, chép lời và chấm điểm. Trường nhận diện: call_id, from, to, direction, duration, recording_url, agent.",
    secrets: [["secret", "Mã bí mật (header x-crm-secret)"]],
  };
  const all = [...providers, call];
  const cur = all.find((p) => p.key === open);

  const card = (p: P) => {
    const s = stats[p.key];
    const [mark, bg] = BADGE[p.key] ?? ["•", "#676879"];
    const connected = !!masked[p.key] && Object.keys(masked[p.key]).length > 0;
    return (
      <button key={p.key} type="button" onClick={() => setOpen(p.key)} className="card flex min-w-0 items-center gap-3 p-3.5 text-left hover:shadow-md">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-lg text-[15px] font-bold text-white" style={{ background: bg }}>
          {mark}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14.5px]">{p.label}</b>
          <span className={`block truncate text-[12.5px] ${s?.lastError ? "text-[#df2f4a]" : "text-ink-2"}`}>
            {s?.lastError ? `Lỗi: ${s.lastError}` : s?.count ? `${s.count} lead · ${s.last}` : connected ? "Đã lưu khoá, chờ dữ liệu" : "Chưa kết nối"}
          </span>
        </span>
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${s?.count ? "bg-[#00c875]" : connected ? "bg-[#fdab3d]" : "bg-[#c4c4c4]"}`} aria-hidden="true" />
      </button>
    );
  };

  return (
    <>
      {GROUPS.map(([title, desc, keys]) => (
        <section key={title} className="mt-6">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <p className="text-[13.5px] text-ink-2">{desc}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{keys.map((k) => providers.find((p) => p.key === k)).filter(Boolean).map((p) => card(p!))}</div>
        </section>
      ))}
      <section className="mt-6">
        <h2 className="text-[16px] font-semibold">Tổng đài & form có sẵn</h2>
        <p className="text-[13.5px] text-ink-2">Cuộc gọi tổng đài vào thẳng Telesales. Form thu lead của CRM dùng ngay không cần cấu hình.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {card(call)}
          <a href={formUrl} target="_blank" rel="noreferrer" className="card flex min-w-0 items-center gap-3 p-3.5 hover:shadow-md">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#00c875] text-white">
              <Icon name="link" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px]">Form thu lead của CRM</b>
              <span className="block truncate text-[12.5px] text-ink-2">Mở form · tự ghi utm_source, utm_campaign</span>
            </span>
          </a>
        </div>
      </section>
      {cur && <Drawer p={cur} url={`${base}/${cur.key}`} masked={masked[cur.key] ?? {}} owner={owner} onClose={() => setOpen(null)} />}
    </>
  );
}

function Drawer({ p, url, masked, owner, onClose }: { p: P; url: string; masked: Record<string, string>; owner: boolean; onClose: () => void }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/sources", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.key, values: vals }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? "Đã lưu khoá kết nối." : j.error);
    if (r.ok) {
      setVals({});
      router.refresh();
    }
  }
  async function test() {
    setBusy(true);
    const r = await fetch("/api/sources/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.key }) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? (j.status === "created" ? "Đã tạo một lead mẫu: xem ở bảng khách và nhật ký bên dưới." : `Kết quả: ${j.status} ${j.message ?? ""}`) : j.error);
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label={p.label} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-surface shadow-panel">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{p.label}</h2>
          <button type="button" className="btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </header>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">
          <div>
            <span className="label">URL webhook</span>
            <div className="mt-1 flex gap-2">
              <input readOnly value={url} className="input min-w-0 flex-1 font-mono text-[12.5px]" onFocus={(e) => e.target.select()} aria-label="URL webhook" />
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  navigator.clipboard?.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Đã chép" : "Chép"}
              </button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-2">Nền tảng cần gọi được máy của bạn qua internet: khi chạy trên máy cá nhân, dùng Cloudflare Tunnel hoặc ngrok (xem README).</p>
          </div>
          <div>
            <span className="label">Cách kết nối</span>
            <p className="mt-1 text-[14px] leading-relaxed">{p.guide}</p>
          </div>
          {owner ? (
            <div className="grid gap-3">
              <span className="label">Khoá kết nối</span>
              {p.secrets.map(([k, label]) => (
                <label key={k} className="grid gap-1 text-[13.5px]">
                  {label}
                  <input
                    type="password"
                    autoComplete="off"
                    className="input"
                    placeholder={masked[k] ? `Đã lưu ${masked[k]}, để trống nếu giữ nguyên` : "Chưa điền"}
                    value={vals[k] ?? ""}
                    onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                  />
                </label>
              ))}
              <p className="text-[12.5px] text-ink-2">Khi đã điền khoá bí mật, CRM từ chối mọi yêu cầu sai chữ ký. Chưa điền thì nhận tất cả để bạn thử nhanh.</p>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-2">Chỉ chủ workspace xem và sửa được khoá kết nối.</p>
          )}
          {msg && <p className="rounded bg-primary-selected px-3 py-2 text-[13.5px]">{msg}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          {p.key !== "call" && (
            <button type="button" className="btn-outline" disabled={busy} onClick={test}>
              Gửi thử một lead
            </button>
          )}
          {owner && (
            <button type="button" className="btn-primary" disabled={busy || !Object.values(vals).some(Boolean)} onClick={save}>
              Lưu khoá
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
