"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer, EmptyState, Stat } from "@/components/ui";
import { RecordLoyalty } from "@/components/care/RecordLoyalty";
import { ago } from "@/lib/format";
import type { LoyaltyPref, Tier } from "@/lib/care/shared";

type Row = { id: string; title: string; phone: string; owner: string; balance: number; earned: number; lastAt: string | null; tier: Tier };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function LoyaltyClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pref, setPref] = useState<LoyaltyPref | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("");
  const [onlyPoints, setOnlyPoints] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/loyalty");
    if (!r.ok) return setRows([]);
    const j = await r.json();
    setRows(j.rows);
    setPref(j.pref);
    setCanManage(j.canManage);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => (!onlyPoints || r.earned > 0) && (!tier || r.tier.name === tier) && (!q.trim() || fold(r.title).includes(fold(q.trim())) || r.phone.includes(q.trim()))), [rows, q, tier, onlyPoints]);
  const withPoints = (rows ?? []).filter((r) => r.earned > 0);
  const outstanding = withPoints.reduce((n, r) => n + r.balance, 0);

  return (
    <div className="mt-5 grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Khách có điểm" value={withPoints.length.toLocaleString("vi-VN")} icon="users" />
        <Stat label="Điểm đang lưu hành" value={outstanding.toLocaleString("vi-VN")} icon="award" tone="#e2a400" />
        {(pref?.tiers ?? []).slice(-2).map((t) => (
          <Stat key={t.name} label={`Hạng ${t.name}`} value={(rows ?? []).filter((r) => r.tier.name === t.name).length} icon="award" tone={t.color} hint={`Từ ${t.minPoints.toLocaleString("vi-VN")} điểm · giảm ${t.discountPct}%`} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative max-sm:w-full">
          <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên hoặc SĐT" aria-label="Tìm khách" className="input h-8 w-56 pl-8 max-sm:w-full" />
        </label>
        <select aria-label="Lọc theo hạng" value={tier} onChange={(e) => setTier(e.target.value)} className="h-8 rounded border border-line bg-surface px-2 text-[13px]">
          <option value="">Mọi hạng</option>
          {pref?.tiers.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex h-8 items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={onlyPoints} onChange={(e) => setOnlyPoints(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /> Chỉ khách đã có điểm
        </label>
        {canManage && (
          <button type="button" className={`btn-ghost ml-auto ${showCfg ? "bg-primary-selected" : ""}`} onClick={() => setShowCfg(!showCfg)} aria-expanded={showCfg}>
            <Icon name="settings" size={15} /> Cấu hình
          </button>
        )}
      </div>

      {showCfg && pref && <ConfigEditor initial={pref} onSaved={(p) => { setPref(p); load(); }} />}

      <div className="card overflow-hidden">
        {rows === null ? (
          <div className="grid gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon="award" title={rows.length ? "Không có khách nào khớp" : "Chưa có khách"} desc="Điểm được cộng tự động khi đơn hàng hoàn tất, hoặc chủ/quản lý cộng tay cho khách." />
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.slice(0, 300).map((r, i) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--row-hover)]">
                  <span className="w-6 flex-none text-right text-[13px] text-ink-2 tnum">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-[12.5px] text-ink-2">
                      {r.phone && <span className="tnum">{r.phone}</span>}
                      {r.lastAt && <span suppressHydrationWarning>{r.phone ? " · " : ""}{ago(r.lastAt)}</span>}
                    </p>
                  </div>
                  <span className="flex-none rounded-full px-2 py-0.5 text-[12px] font-medium text-white" style={{ background: r.tier.color }}>
                    {r.tier.name}
                  </span>
                  <span className="w-20 flex-none text-right font-semibold tnum">{r.balance.toLocaleString("vi-VN")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title}
        subtitle={
          open && (
            <Link href={`/w/b/contacts?open=${open.id}`} className="text-primary hover:underline">
              Mở hồ sơ khách
            </Link>
          )
        }
        width={420}
      >
        {open && (
          <div className="px-5 py-4">
            <RecordLoyalty recordId={open.id} onChange={() => load()} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ConfigEditor({ initial, onSaved }: { initial: LoyaltyPref; onSaved: (p: LoyaltyPref) => void }) {
  const [v, setV] = useState<LoyaltyPref>(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const setTier = (i: number, patch: Partial<Tier>) => setV({ ...v, tiers: v.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setReward = (i: number, patch: Partial<LoyaltyPref["rewards"][number]>) => setV({ ...v, rewards: v.rewards.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  async function save() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/loyalty", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Không lưu được");
    setV(j);
    setMsg("Đã lưu cấu hình");
    onSaved(j);
  }

  return (
    <section className="card anim-fade grid gap-4 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" /> Bật tích điểm
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          Mỗi
          <input type="number" min={1} className="input h-8 w-28 tnum" value={v.vndPerPoint} onChange={(e) => setV({ ...v, vndPerPoint: Number(e.target.value) })} aria-label="Số tiền mỗi điểm" />
          đồng = 1 điểm
        </label>
      </div>

      <div>
        <p className="section-title">Hạng thành viên (theo tổng điểm đã tích)</p>
        <div className="mt-2 grid gap-2">
          {v.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)_90px_80px_32px] items-center gap-2 max-sm:grid-cols-[32px_minmax(0,1fr)_32px]">
              <input type="color" aria-label={`Màu hạng ${i + 1}`} value={t.color} onChange={(e) => setTier(i, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-line bg-surface" />
              <input aria-label={`Tên hạng ${i + 1}`} className="input h-8" value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} />
              <label className="flex items-center gap-1 text-[12.5px] text-ink-2 max-sm:col-start-2">
                <input aria-label={`Điểm tối thiểu hạng ${i + 1}`} type="number" min={0} className="input h-8 tnum" value={t.minPoints} disabled={i === 0} onChange={(e) => setTier(i, { minPoints: Number(e.target.value) })} />
              </label>
              <label className="flex items-center gap-1 text-[12.5px] text-ink-2 max-sm:col-start-2">
                <input aria-label={`Giảm giá hạng ${i + 1}`} type="number" min={0} max={100} className="input h-8 tnum" value={t.discountPct} onChange={(e) => setTier(i, { discountPct: Number(e.target.value) })} />%
              </label>
              <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2 max-sm:col-start-3 max-sm:row-start-1" aria-label={`Xoá hạng ${t.name}`} disabled={i === 0} onClick={() => setV({ ...v, tiers: v.tiers.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <p className="text-[12px] text-ink-2">Cột số: điểm tối thiểu và % giảm giá. Hạng đầu luôn từ 0 điểm.</p>
          <button type="button" className="btn-ghost w-fit" onClick={() => setV({ ...v, tiers: [...v.tiers, { name: "Hạng mới", minPoints: (v.tiers.at(-1)?.minPoints ?? 0) + 1000, discountPct: 0, color: "#579bfc" }] })}>
            <Icon name="plus" size={14} /> Thêm hạng
          </button>
        </div>
      </div>

      <div>
        <p className="section-title">Quà đổi điểm</p>
        <div className="mt-2 grid gap-2">
          {v.rewards.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_32px] items-center gap-2">
              <input aria-label={`Tên quà ${i + 1}`} className="input h-8" value={r.name} onChange={(e) => setReward(i, { name: e.target.value })} />
              <input aria-label={`Điểm đổi quà ${i + 1}`} type="number" min={1} className="input h-8 tnum" value={r.points} onChange={(e) => setReward(i, { points: Number(e.target.value) })} />
              <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-ink-2" aria-label={`Xoá quà ${r.name}`} onClick={() => setV({ ...v, rewards: v.rewards.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost w-fit" onClick={() => setV({ ...v, rewards: [...v.rewards, { name: "Quà mới", points: 100 }] })}>
            <Icon name="plus" size={14} /> Thêm quà
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          Lưu cấu hình
        </button>
        {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
      </div>
    </section>
  );
}
