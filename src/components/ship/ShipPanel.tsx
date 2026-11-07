"use client";
// Khung "Vận chuyển" trên trang đơn: địa chỉ giao, chọn hãng, báo phí, tạo vận đơn (COD = phần còn nợ), hành trình, huỷ.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { SHIP_STATUS, type ShipEvent, type ShipStatus } from "@/lib/ship/types";

type Addr = { name: string; phone: string; address: string; province: string; district: string; ward: string };
type Ship = { id: string; carrier: string; carrierLabel: string; trackingCode: string; status: string; fee: number; cod: number; events: ShipEvent[]; createdAt: string; createdBy: string; labelUrl: string };
type Data = { items: Ship[]; address: Addr; weightGram: number; cod: number; defaultCarrier: string; carriers: { key: string; label: string; configured: boolean }[]; canManage: boolean; fromReady: boolean; dryRun: boolean };

const TONE: Record<string, string> = { neutral: "badge", info: "badge-info", warning: "badge-warning", success: "badge-success", danger: "badge-danger" };
const vnd = (n: number) => `${Math.round(n || 0).toLocaleString("vi-VN")} ₫`;
const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ACTIVE = ["created", "picking", "delivering"];

export function ShipBadge({ status }: { status: string }) {
  const s = SHIP_STATUS[status as ShipStatus];
  return <span className={TONE[s?.tone ?? "neutral"]}>{s?.label ?? status}</span>;
}

export function ShipPanel({ orderId, closed, autoOpen = false }: { orderId: string; closed?: boolean; autoOpen?: boolean }) {
  const [d, setD] = useState<Data | null>(null);
  const [addr, setAddr] = useState<Addr | null>(null);
  const [form, setForm] = useState({ carrier: "demo", weightGram: 0, cod: 0, note: "" });
  const [open, setOpen] = useState(autoOpen);
  const [quote, setQuote] = useState<{ fee: number; note?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/ship?orderId=${encodeURIComponent(orderId)}`);
    const j = (await r.json().catch(() => ({}))) as Data & { error?: string };
    if (!r.ok) return setErr(j.error ?? "Không tải được");
    setD(j);
    setAddr((a) => a ?? j.address);
    const first = j.carriers.find((c) => c.key === j.defaultCarrier && c.configured) ?? j.carriers.find((c) => c.configured);
    setForm((f) => (f.weightGram ? f : { carrier: first?.key ?? "demo", weightGram: j.weightGram, cod: j.cod, note: "" }));
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function call<T>(url: string, method: string, body: unknown): Promise<T | null> {
    setBusy(true);
    setErr("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Không thực hiện được");
      return null;
    }
    return j as T;
  }
  const saveAddr = () => (addr ? call("/api/ship", "PUT", { orderId, ...addr }) : null);
  async function doQuote() {
    if (!(await saveAddr())) return;
    const r = await call<{ fee: number; note?: string }>("/api/ship", "POST", { action: "quote", orderId, ...form });
    if (r) setQuote(r);
  }
  async function create() {
    if (!(await saveAddr())) return;
    const r = await call<Ship>("/api/ship", "POST", { action: "create", orderId, ...form });
    if (!r) return;
    toast(`Đã tạo vận đơn ${r.trackingCode}`);
    setOpen(false);
    setQuote(null);
    // Tạo vận đơn có thể chuyển đơn sang "Đang giao": tải lại để khung trạng thái đơn cập nhật.
    window.location.reload();
  }
  async function act(id: string, action: "cancel" | "refresh" | "label") {
    const r = await call<Ship & { url?: string }>(`/api/ship/${id}`, "PATCH", { action });
    if (!r) return;
    if (action === "label" && r.url) window.open(r.url, "_blank", "noopener");
    else {
      toast(action === "cancel" ? "Đã huỷ vận đơn" : "Đã cập nhật trạng thái");
      if (r.status === "delivered") window.location.reload();
      else await load();
    }
  }

  if (err && !d) return <section className="card p-4 text-[13px] text-ink-2">{err}</section>;
  if (!d || !addr) return <section className="card h-24 animate-pulse p-4" aria-label="Đang tải vận chuyển" />;
  const active = d.items.find((s) => ACTIVE.includes(s.status));
  const setA = (k: keyof Addr, v: string) => setAddr({ ...addr, [k]: v });

  return (
    <section className="card grid gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">Vận chuyển</h2>
        {d.dryRun && <span className="badge-warning">Chạy khô</span>}
      </div>
      {d.items.map((s) => (
        <div key={s.id} className="grid gap-1.5 rounded border border-line-soft p-2 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <ShipBadge status={s.status} />
            <b className="font-mono">{s.trackingCode}</b>
            <span className="text-ink-2">{s.carrierLabel}</span>
          </div>
          <span className="text-[12.5px] text-ink-2">
            Phí {vnd(s.fee)} · COD {vnd(s.cod)} · {s.createdBy || "—"}
          </span>
          <ol className="grid gap-0.5 border-l-2 border-line-soft pl-2.5">
            {[...s.events].reverse().map((e, i) => (
              <li key={i} className={`text-[12px] ${i === 0 ? "text-ink" : "text-ink-2"}`}>
                <span className="tnum">{dt(e.at)}</span> · {e.text}
              </li>
            ))}
          </ol>
          {d.canManage && (
            <div className="flex flex-wrap gap-1.5">
              {s.carrier !== "demo" && ACTIVE.includes(s.status) && (
                <button type="button" className="btn-outline h-7 text-[12.5px]" disabled={busy} onClick={() => act(s.id, "refresh")}>
                  <Icon name="refresh" size={13} /> Cập nhật
                </button>
              )}
              {s.carrier === "ghn" && (
                <button type="button" className="btn-outline h-7 text-[12.5px]" disabled={busy} onClick={() => act(s.id, "label")}>
                  <Icon name="doc" size={13} /> In nhãn
                </button>
              )}
              {ACTIVE.includes(s.status) && (
                <button type="button" className="btn-ghost h-7 text-[12.5px] text-danger" disabled={busy} onClick={() => act(s.id, "cancel")}>
                  Huỷ vận đơn
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {!active && !closed && d.canManage && !open && (
        <button type="button" className="btn-outline justify-center" onClick={() => setOpen(true)}>
          <Icon name="box" size={15} /> Tạo vận đơn
        </button>
      )}
      {!active && !closed && d.canManage && open && (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-0.5">
              <span className="label">Người nhận</span>
              <input className="input h-8" value={addr.name} onChange={(e) => setA("name", e.target.value)} />
            </label>
            <label className="grid gap-0.5">
              <span className="label">Điện thoại</span>
              <input className="input h-8 tnum" inputMode="tel" value={addr.phone} onChange={(e) => setA("phone", e.target.value)} />
            </label>
            <label className="col-span-2 grid gap-0.5">
              <span className="label">Số nhà, đường</span>
              <input className="input h-8" value={addr.address} onChange={(e) => setA("address", e.target.value)} />
            </label>
            <label className="grid gap-0.5">
              <span className="label">Phường/Xã</span>
              <input className="input h-8" value={addr.ward} onChange={(e) => setA("ward", e.target.value)} />
            </label>
            <label className="grid gap-0.5">
              <span className="label">Quận/Huyện</span>
              <input className="input h-8" value={addr.district} onChange={(e) => setA("district", e.target.value)} />
            </label>
            <label className="col-span-2 grid gap-0.5">
              <span className="label">Tỉnh/Thành phố</span>
              <input className="input h-8" value={addr.province} onChange={(e) => setA("province", e.target.value)} />
            </label>
            <label className="col-span-2 grid gap-0.5">
              <span className="label">Hãng vận chuyển</span>
              <select className="input h-8" value={form.carrier} onChange={(e) => (setForm({ ...form, carrier: e.target.value }), setQuote(null))}>
                {d.carriers.map((c) => (
                  <option key={c.key} value={c.key} disabled={!c.configured}>
                    {c.label}
                    {c.configured ? "" : " (chưa kết nối)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-0.5">
              <span className="label">Khối lượng (g)</span>
              <input className="input h-8 tnum" type="number" min={1} value={form.weightGram} onChange={(e) => (setForm({ ...form, weightGram: Math.max(1, Number(e.target.value) || 0) }), setQuote(null))} />
            </label>
            <label className="grid gap-0.5">
              <span className="label">Thu hộ COD (₫)</span>
              <input className="input h-8 tnum" type="number" min={0} step={1000} value={form.cod} onChange={(e) => setForm({ ...form, cod: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label className="col-span-2 grid gap-0.5">
              <span className="label">Ghi chú cho shipper</span>
              <input className="input h-8" value={form.note} maxLength={250} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Gọi trước khi giao…" />
            </label>
          </div>
          {!d.fromReady && <p className="text-[12px] text-warning">Chưa có địa chỉ lấy hàng: điền ở Cài đặt → Thanh toán & giao hàng.</p>}
          {quote && (
            <p className="rounded bg-surface-2 px-2 py-1.5 text-[13px]">
              Phí dự kiến: <b className="tnum">{vnd(quote.fee)}</b>
              {quote.note ? <span className="text-ink-2"> · {quote.note}</span> : null}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-outline" disabled={busy} onClick={doQuote}>
              Báo phí
            </button>
            <button type="button" className="btn-primary flex-1 justify-center" disabled={busy} onClick={create}>
              <Icon name="box" size={15} /> Tạo vận đơn
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Thôi
            </button>
          </div>
        </div>
      )}
      {!d.items.length && (closed || !d.canManage) && <p className="text-[13px] text-ink-2">Chưa có vận đơn.</p>}
      {err && (
        <p role="alert" className="rounded bg-danger-soft px-2 py-1.5 text-[12.5px] text-danger">
          {err}
        </p>
      )}
    </section>
  );
}
