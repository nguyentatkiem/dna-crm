"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Drawer, EmptyState, Stat, Tabs } from "@/components/ui";
import { IssueVoucherDrawer } from "@/components/voucher/IssueVoucherDrawer";
import { SEND_LABEL, VOUCHER_STATUSES, VOUCHER_STATUS_LABEL, VOUCHER_STATUS_TONE, valueText, type SendChannel } from "@/lib/voucher/shared";
import type { VoucherDTO } from "@/lib/voucher/api";
import type { CampaignWithStats } from "@/lib/voucher/service";

type Camp = Omit<CampaignWithStats, "createdAt"> & { createdAt: string };
type Draft = { name: string; prefix: string; kind: "percent" | "amount"; value: string; maxDiscount: string; minOrder: string; validDays: string; perCustomer: string; note: string; active: boolean };
const EMPTY: Draft = { name: "", prefix: "DNA", kind: "percent", value: "10", maxDiscount: "", minOrder: "", validDays: "30", perCustomer: "1", note: "", active: true };
const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const dmy = (s: string) => new Date(s).toLocaleDateString("vi-VN");

export function VouchersClient() {
  const [tab, setTab] = useState("campaigns");
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [items, setItems] = useState<VoucherDTO[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [status, setStatus] = useState("");
  const [campaign, setCampaign] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id?: string; d: Draft } | null>(null);
  const [issue, setIssue] = useState<{ campaignId?: string } | null>(null);
  const [showTpl, setShowTpl] = useState(false);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    if (status) sp.set("status", status);
    if (campaign) sp.set("campaign", campaign);
    if (q.trim()) sp.set("q", q.trim());
    const r = await fetch(`/api/vouchers?${sp}`);
    if (!r.ok) return setItems([]);
    const j = await r.json();
    setItems(j.items);
    setCamps(j.campaigns);
    setCanManage(j.canManage);
  }, [status, campaign, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function toggle(c: Camp) {
    setCamps((x) => x?.map((i) => (i.id === c.id ? { ...i, active: !c.active } : i)) ?? null);
    const r = await fetch(`/api/vouchers/campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) }).catch(() => null);
    // Lỗi thì trả lại trạng thái cũ.
    if (!r?.ok) setCamps((x) => x?.map((i) => (i.id === c.id ? { ...i, active: c.active } : i)) ?? null);
  }
  async function voidCode(v: VoucherDTO) {
    if (!confirm(`Huỷ mã ${v.code}? Khách sẽ không dùng được mã này nữa.`)) return;
    const r = await fetch(`/api/vouchers/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "void" }) });
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? "Không huỷ được");
    load();
  }

  const totals = (camps ?? []).reduce((s, c) => ({ issued: s.issued + c.issued, used: s.used + c.used, discount: s.discount + c.discountTotal }), { issued: 0, used: 0, discount: 0 });

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold">Voucher & mã giảm giá</h1>
          <p className="mt-1 text-ink-2">Tặng mã cho khách dịp sinh nhật, tri ân, kéo khách quay lại. Mã áp ngay ở form đơn hàng và tự đánh dấu đã dùng.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <button type="button" className={`btn-ghost ${showTpl ? "bg-primary-selected" : ""}`} onClick={() => setShowTpl(!showTpl)} aria-expanded={showTpl}>
              <Icon name="sms" size={15} /> Mẫu tin
            </button>
          )}
          <button type="button" className="btn-outline" onClick={() => setIssue({})}>
            <Icon name="gift" size={15} /> Phát mã
          </button>
          {canManage && (
            <button type="button" className="btn-primary" onClick={() => setEdit({ d: EMPTY })}>
              <Icon name="plus" size={15} /> Chương trình mới
            </button>
          )}
        </div>
      </div>

      {showTpl && <TemplateSettings onClose={() => setShowTpl(false)} />}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chương trình đang chạy" value={(camps ?? []).filter((c) => c.active).length} icon="megaphone" tone="#a25ddc" />
        <Stat label="Mã đã phát" value={totals.issued} icon="gift" />
        <Stat label="Mã đã dùng" value={totals.used} hint={totals.issued ? `Tỷ lệ dùng ${Math.round((totals.used / totals.issued) * 100)}%` : undefined} icon="check" tone="#00c875" />
        <Stat label="Tổng tiền đã giảm" value={money(totals.discount)} icon="wallet" tone="#fdab3d" />
      </div>

      <Tabs className="mt-4" value={tab} onChange={setTab} items={[{ key: "campaigns", label: "Chương trình", count: camps?.length }, { key: "codes", label: "Mã đã phát", count: items?.length }]} />

      {tab === "campaigns" ? (
        camps === null ? (
          <div className="skeleton mt-3 h-40" />
        ) : !camps.length ? (
          <div className="card mt-3">
            <EmptyState icon="gift" title="Chưa có chương trình voucher" desc="Ví dụ: “Sinh nhật giảm 10%”, “Tri ân 50.000đ cho khách quay lại”. Tạo xong, phát mã cho từng khách hoặc cả nhóm khách." action={canManage ? { label: "Tạo chương trình", onClick: () => setEdit({ d: EMPTY }) } : undefined} />
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {camps.map((c) => (
              <div key={c.id} className={`card grid gap-3 p-4 ${c.active ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-accent-soft text-accent">
                    <Icon name="gift" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-semibold">{c.name}</p>
                    <p className="text-[13px] text-ink-2">{valueText(c)}</p>
                  </div>
                  {canManage && (
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                      <input type="checkbox" checked={c.active} onChange={() => toggle(c)} className="h-4 w-4 accent-[var(--primary)]" /> Bật
                    </label>
                  )}
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
                  <span>
                    Tiền tố <b className="font-mono text-ink">{c.prefix}</b>
                  </span>
                  <span>Hạn {c.validDays} ngày</span>
                  <span>Tối đa {c.perCustomer} mã/khách</span>
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Đã phát", c.issued],
                    ["Đã dùng", c.used],
                    ["Đã giảm", money(c.discountTotal)],
                  ].map(([l, v]) => (
                    <div key={l as string} className="rounded-lg bg-[var(--row-hover)] p-2">
                      <p className="truncate font-title text-[17px] font-semibold tnum">{v}</p>
                      <p className="text-[12px] text-ink-2">{l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.active && (
                    <button type="button" className="btn-outline h-8" onClick={() => setIssue({ campaignId: c.id })}>
                      <Icon name="gift" size={14} /> Phát mã
                    </button>
                  )}
                  <button type="button" className="btn-ghost h-8" onClick={() => { setCampaign(c.id); setStatus(""); setTab("codes"); }}>
                    <Icon name="table" size={14} /> Xem mã
                  </button>
                  {canManage && (
                    <button type="button" className="btn-ghost h-8" onClick={() => setEdit({ id: c.id, d: { name: c.name, prefix: c.prefix, kind: c.kind as Draft["kind"], value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", minOrder: c.minOrder ? String(c.minOrder) : "", validDays: String(c.validDays), perCustomer: String(c.perCustomer), note: c.note, active: c.active } })}>
                      <Icon name="edit" size={14} /> Sửa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 max-sm:w-full">
              <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã" aria-label="Tìm mã" className="input h-8 w-48 pl-8 max-sm:w-full" />
            </label>
            <select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
              <option value="">Mọi trạng thái</option>
              {VOUCHER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VOUCHER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select aria-label="Lọc chương trình" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
              <option value="">Mọi chương trình</option>
              {(camps ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="card mt-3 overflow-x-auto">
            {items === null ? (
              <div className="skeleton m-4 h-24" />
            ) : !items.length ? (
              <EmptyState icon="gift" title="Không có mã nào" desc="Đổi bộ lọc hoặc phát mã cho khách." compact />
            ) : (
              <table className="w-full min-w-[720px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line-soft text-left text-[12.5px] text-ink-2">
                    <th className="px-4 py-2 font-medium">Mã</th>
                    <th className="px-2 py-2 font-medium">Khách</th>
                    <th className="px-2 py-2 font-medium">Chương trình</th>
                    <th className="px-2 py-2 font-medium">Trạng thái</th>
                    <th className="px-2 py-2 font-medium">Hạn / dùng</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {items.map((v) => (
                    <tr key={v.id} className="hover:bg-[var(--row-hover)]">
                      <td className="px-4 py-2">
                        <span className="font-mono font-semibold">{v.code}</span>
                        <p className="text-[12px] text-ink-2">
                          {v.reason}
                          {v.sentVia ? ` · đã gửi qua ${SEND_LABEL[v.sentVia as SendChannel] ?? v.sentVia}` : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        {v.recordId ? (
                          <Link href={`/w/b/${v.objectKey}?open=${v.recordId}`} className="hover:underline">
                            {v.customer || "Khách"}
                          </Link>
                        ) : (
                          <span className="text-ink-2">–</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {v.campaign}
                        <p className="text-[12px] text-ink-2">{v.value}</p>
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={VOUCHER_STATUS_TONE[v.status]}>{VOUCHER_STATUS_LABEL[v.status]}</Badge>
                      </td>
                      <td className="px-2 py-2 text-[12.5px] tnum">
                        {v.status === "used" ? (
                          <>
                            {v.usedAt ? dmy(v.usedAt) : ""} · −{money(v.discount)}
                            {v.usedOrderId && (
                              <Link href={`/w/orders/${v.usedOrderId}`} className="block text-ink-2 hover:underline">
                                {v.usedOrder || "Xem đơn"}
                              </Link>
                            )}
                          </>
                        ) : (
                          dmy(v.expiresAt)
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {canManage && v.status === "issued" && (
                          <button type="button" className="btn-ghost h-7 text-[12.5px] text-danger" onClick={() => voidCode(v)}>
                            Huỷ mã
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {edit && <CampaignDrawer id={edit.id} initial={edit.d} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      <IssueVoucherDrawer open={!!issue} onClose={() => setIssue(null)} campaignId={issue?.campaignId} allowSegment={canManage} onDone={load} />
    </>
  );
}

function CampaignDrawer({ id, initial, onClose, onSaved }: { id?: string; initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  // Tiền gõ kiểu Việt "500.000" hay "500,000": chỉ lấy chữ số. Phần trăm cho phép số lẻ "12,5".
  const num = (s: string) => Number(String(s).replace(/\D/g, "")) || 0;
  const pct = (s: string) => Number(String(s).replace(",", ".").replace(/[^\d.]/g, "")) || 0;
  const val = (s: string) => (d.kind === "percent" ? pct(s) : num(s));
  const preview = { kind: d.kind, value: val(d.value), maxDiscount: num(d.maxDiscount), minOrder: num(d.minOrder) };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const body = { ...d, value: val(d.value), maxDiscount: num(d.maxDiscount), minOrder: num(d.minOrder), validDays: num(d.validDays), perCustomer: num(d.perCustomer) || 1 };
    const r = await fetch(id ? `/api/vouchers/campaigns/${id}` : "/api/vouchers/campaigns", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    onSaved();
  }
  async function remove() {
    if (!id || !confirm("Xoá chương trình này và các mã chưa dùng?")) return;
    const r = await fetch(`/api/vouchers/campaigns/${id}`, { method: "DELETE" });
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).error ?? "Không xoá được");
    onSaved();
  }

  return (
    <Drawer open onClose={onClose} title={id ? "Sửa chương trình" : "Chương trình voucher mới"} subtitle={preview.value ? valueText(preview) : undefined} width={480}>
      <form onSubmit={save} className="grid gap-3.5 px-5 py-4">
        <label className="grid gap-1">
          <span className="label">Tên chương trình</span>
          <input className="input" value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={120} placeholder="VD: Sinh nhật 10%" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="label">Kiểu giảm</span>
            <select className="input" value={d.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
              <option value="percent">Theo %</option>
              <option value="amount">Số tiền</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="label">{d.kind === "percent" ? "Giảm (%)" : "Giảm (đ)"}</span>
            <input className="input tnum" inputMode="numeric" value={d.value} onChange={(e) => set("value", e.target.value)} />
          </label>
          {d.kind === "percent" && (
            <label className="grid gap-1">
              <span className="label">Giảm tối đa (đ)</span>
              <input className="input tnum" inputMode="numeric" value={d.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} placeholder="Không giới hạn" />
            </label>
          )}
          <label className="grid gap-1">
            <span className="label">Đơn tối thiểu (đ)</span>
            <input className="input tnum" inputMode="numeric" value={d.minOrder} onChange={(e) => set("minOrder", e.target.value)} placeholder="0" />
          </label>
          <label className="grid gap-1">
            <span className="label">Hạn dùng (ngày)</span>
            <input className="input tnum" inputMode="numeric" value={d.validDays} onChange={(e) => set("validDays", e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="label">Số mã tối đa / khách</span>
            <input className="input tnum" inputMode="numeric" value={d.perCustomer} onChange={(e) => set("perCustomer", e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="label">Tiền tố mã</span>
            <input className="input font-mono uppercase" value={d.prefix} onChange={(e) => set("prefix", e.target.value)} maxLength={8} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="label">Ghi chú nội bộ</span>
          <textarea className="textarea min-h-[60px]" value={d.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={d.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /> Đang chạy (cho phép phát và dùng mã)
        </label>
        {err && (
          <p role="alert" className="text-[13px] text-danger">
            {err}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {id && (
            <button type="button" className="btn-ghost text-danger" onClick={remove}>
              <Icon name="trash" size={14} /> Xoá
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

function TemplateSettings({ onClose }: { onClose: () => void }) {
  const [t, setT] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/vouchers/settings").then((r) => r.json()).then((j) => setT(j.template ?? "")).catch(() => setT(""));
  }, []);
  if (t === null) return <div className="skeleton mt-4 h-28" />;
  async function save() {
    const r = await fetch("/api/vouchers/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: t }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Đã lưu" : j.error ?? "Không lưu được");
  }
  return (
    <section className="card mt-4 grid gap-2 p-4">
      <h2 className="section-title">Mẫu tin gửi kèm voucher</h2>
      <textarea className="textarea min-h-[70px]" value={t} onChange={(e) => setT(e.target.value)} maxLength={1000} />
      <p className="text-[12px] text-ink-2">Biến: {"{code}"} mã, {"{value}"} giá trị, {"{expiresAt}"} hạn dùng, {"{name}"} tên khách.</p>
      <div className="flex items-center justify-end gap-2">
        {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
        <button type="button" className="btn-ghost" onClick={onClose}>
          Đóng
        </button>
        <button type="button" className="btn-primary" onClick={save}>
          Lưu mẫu tin
        </button>
      </div>
    </section>
  );
}
