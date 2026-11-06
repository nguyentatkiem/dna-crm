"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ago } from "@/lib/format";
import type { Reward, Tier } from "@/lib/care/shared";

type View = {
  pref: { enabled: boolean; vndPerPoint: number; rewards: Reward[]; tiers: Tier[] };
  balance: number;
  earned: number;
  lastAt: string | null;
  tier: Tier;
  next: { tier: Tier; need: number } | null;
  history: { id: string; points: number; reason: string; by: string; orderId: string | null; at: string }[];
  canAdjust: boolean;
};

/** Thẻ điểm thưởng của một khách: số dư, hạng, lịch sử gần đây, cộng/trừ nhanh và đổi quà. */
export function RecordLoyalty({ recordId, onChange }: { recordId: string; onChange?: (balance: number) => void }) {
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"" | "adjust" | "redeem">("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [reward, setReward] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/loyalty/${recordId}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Không tải được điểm");
    setV(j);
  }, [recordId]);
  useEffect(() => {
    setV(null);
    setErr("");
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const body = mode === "adjust" ? { kind: "adjust", points: Math.trunc(Number(points)), reason } : { kind: "redeem", reward: Number(reward) };
    const r = await fetch(`/api/loyalty/${recordId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    setV(j);
    setMode("");
    setPoints("");
    setReason("");
    onChange?.(j.balance);
  }

  if (!v) return err ? <p className="text-[13px] text-danger">{err}</p> : <div className="skeleton h-28" />;
  const pct = v.next ? Math.min(100, Math.round(((v.earned - v.tier.minPoints) / (v.next.tier.minPoints - v.tier.minPoints)) * 100)) : 100;
  const affordable = v.pref.rewards.map((r, i) => ({ ...r, i })).filter((r) => r.points <= v.balance);

  return (
    <div className="grid gap-3">
      {!v.pref.enabled && <p className="rounded bg-warning-soft px-2.5 py-1.5 text-[12.5px] text-warning">Tích điểm đang tắt: đơn mới không được cộng điểm.</p>}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full text-white" style={{ background: v.tier.color }}>
          <Icon name="award" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[22px] font-semibold leading-none tnum">
            {v.balance.toLocaleString("vi-VN")} <span className="text-[13px] font-normal text-ink-2">điểm</span>
          </p>
          <p className="mt-1 text-[13px] text-ink-2">
            Hạng <b className="font-medium" style={{ color: v.tier.color }}>{v.tier.name}</b>
            {v.tier.discountPct > 0 && ` · giảm ${v.tier.discountPct}%`}
          </p>
        </div>
      </div>
      {v.next && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: v.next.tier.color }} />
          </div>
          <p className="mt-1 text-[12px] text-ink-2 tnum">
            Còn {v.next.need.toLocaleString("vi-VN")} điểm tích luỹ để lên {v.next.tier.name} (đã tích {v.earned.toLocaleString("vi-VN")})
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={`btn-outline h-7 text-[13px] ${mode === "redeem" ? "bg-primary-selected" : ""}`} onClick={() => setMode(mode === "redeem" ? "" : "redeem")} disabled={!v.pref.rewards.length}>
          <Icon name="gift" size={14} /> Đổi quà
        </button>
        {v.canAdjust && (
          <button type="button" className={`btn-outline h-7 text-[13px] ${mode === "adjust" ? "bg-primary-selected" : ""}`} onClick={() => setMode(mode === "adjust" ? "" : "adjust")}>
            <Icon name="edit" size={14} /> Cộng/trừ điểm
          </button>
        )}
      </div>

      {mode && (
        <form onSubmit={submit} className="anim-fade grid gap-2 rounded-lg bg-surface-2 p-3">
          {mode === "redeem" ? (
            affordable.length ? (
              <select aria-label="Chọn quà" className="input h-8" value={reward} onChange={(e) => setReward(e.target.value)}>
                {v.pref.rewards.map((r, i) => (
                  <option key={i} value={i} disabled={r.points > v.balance}>
                    {r.name} · {r.points.toLocaleString("vi-VN")} điểm{r.points > v.balance ? " (chưa đủ)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[13px] text-ink-2">Chưa đủ điểm đổi quà nào.</p>
            )
          ) : (
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <input aria-label="Số điểm" type="number" className="input h-8 tnum" placeholder="+100 / -50" value={points} onChange={(e) => setPoints(e.target.value)} required />
              <input aria-label="Lý do" className="input h-8" placeholder="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setMode("")}>
              Huỷ
            </button>
            <button type="submit" className="btn-primary h-7 text-[13px]" disabled={busy || (mode === "redeem" && (!affordable.length || Number(reward) >= v.pref.rewards.length || v.pref.rewards[Number(reward)].points > v.balance))}>
              Xác nhận
            </button>
          </div>
        </form>
      )}
      {err && (
        <p role="alert" className="text-[13px] text-danger">
          {err}
        </p>
      )}

      <div>
        <p className="section-title">Lịch sử điểm</p>
        {v.history.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-ink-2">Chưa có giao dịch điểm. Điểm tự cộng khi đơn hàng hoàn tất ({v.pref.vndPerPoint.toLocaleString("vi-VN")}đ = 1 điểm).</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line-soft">
            {v.history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                <span className={`w-16 flex-none font-medium tnum ${h.points > 0 ? "text-success" : "text-danger"}`}>
                  {h.points > 0 ? "+" : ""}
                  {h.points.toLocaleString("vi-VN")}
                </span>
                <span className="min-w-0 flex-1 truncate" title={h.reason}>
                  {h.reason || "–"}
                </span>
                <span className="flex-none text-[12px] text-ink-2" suppressHydrationWarning>
                  {ago(h.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
