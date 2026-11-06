"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SCORE_EVENTS, SCORE_EVENT_LABEL, SCORING_DEFAULT, scoreParts, type ScoreCounts, type ScoreEvent, type ScoringRules } from "@/lib/c360/scoring";

/** Khách mẫu cho phần "Ví dụ": hồ sơ 70 điểm, mở 4 email, nhấp 1 lần, nhắn 2 tin, 1 đơn xong, 1 phiếu hỗ trợ. */
const SAMPLE: { profile: number; counts: ScoreCounts } = { profile: 70, counts: { email_open: 4, email_click: 1, message_in: 2, order_done: 1, ticket_open: 1 } };

/** Ô số cho phép gõ dở dang ("-", "") mà không bị nhảy về 0. */
function NumInput({ value, onChange, className = "", ...rest }: { value: number; onChange: (n: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...rest}
      inputMode="numeric"
      className={`input tnum ${className}`}
      value={draft ?? String(value)}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d-]/g, "");
        setDraft(v);
        if (/^-?\d+$/.test(v)) onChange(Number(v));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function ScoringPanel({ initial, canEdit }: { initial: ScoringRules; canEdit: boolean }) {
  const [r, setR] = useState(initial);
  const [counts, setCounts] = useState<ScoreCounts>(SAMPLE.counts);
  const [profile, setProfile] = useState(SAMPLE.profile);
  const [idle, setIdle] = useState(0);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ex = scoreParts(profile, counts, idle, r);
  const setEv = (k: ScoreEvent, v: number) => setR({ ...r, events: { ...r.events, [k]: v } });
  const num = (s: string) => (s === "" || s === "-" ? 0 : Math.round(Number(s)) || 0);

  async function save() {
    setBusy("save");
    setMsg(null);
    const res = await fetch("/api/c360/scoring", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    setR(j);
    setMsg({ ok: true, text: "Đã lưu luật chấm điểm. Bấm “Tính lại ngay” để áp dụng cho mọi khách." });
  }
  async function recompute() {
    setBusy("re");
    setMsg(null);
    const res = await fetch("/api/c360/scoring", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không tính lại được" });
    setMsg({ ok: true, text: `Đã tính lại ${j.checked} khách, ${j.changed} khách đổi điểm.` });
  }

  return (
    <div className="mt-5 grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="card p-5">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-medium">Bật chấm điểm theo hành vi</span>
              <span className="text-[13px] text-ink-2">Tắt thì điểm khách chỉ dựa vào hồ sơ như trước.</span>
            </span>
            <input type="checkbox" className="h-5 w-5" checked={r.enabled} disabled={!canEdit} onChange={(e) => setR({ ...r, enabled: e.target.checked })} />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="pw" className="label">
                Giữ % điểm hồ sơ
              </label>
              <input id="pw" type="number" min={0} max={100} className="input mt-1 tnum" disabled={!canEdit} value={r.profileWeight} onChange={(e) => setR({ ...r, profileWeight: num(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="wd" className="label">
                Tính hành vi trong (ngày)
              </label>
              <input id="wd" type="number" min={7} max={365} className="input mt-1 tnum" disabled={!canEdit} value={r.windowDays} onChange={(e) => setR({ ...r, windowDays: num(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="dc" className="label">
                Trừ mỗi tuần im lặng
              </label>
              <input id="dc" type="number" min={0} max={20} className="input mt-1 tnum" disabled={!canEdit} value={r.decayPerIdleWeek} onChange={(e) => setR({ ...r, decayPerIdleWeek: num(e.target.value) })} />
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Điểm cho mỗi hành vi</h2>
          <p className="mt-1 text-[13px] text-ink-2">Số âm để trừ điểm. Mỗi loại hành vi cộng/trừ tối đa 30 điểm.</p>
          <div className="mt-3 grid gap-2">
            {SCORE_EVENTS.map((k) => (
              <div key={k} className="flex items-center gap-3">
                <label htmlFor={`ev-${k}`} className="min-w-0 flex-1 text-[14px]">
                  {SCORE_EVENT_LABEL[k]}
                </label>
                <NumInput id={`ev-${k}`} className="w-20" disabled={!canEdit} value={r.events[k]} onChange={(n) => setEv(k, Math.max(-50, Math.min(50, n)))} />
                <input aria-label={`Số lần ${SCORE_EVENT_LABEL[k]} của khách mẫu`} type="number" min={0} className="input w-16 tnum" title="Số lần (khách mẫu)" value={counts[k] ?? 0} onChange={(e) => setCounts({ ...counts, [k]: Math.max(0, num(e.target.value)) })} />
              </div>
            ))}
            <p className="text-right text-[12px] text-ink-2">Cột cuối: số lần của khách mẫu bên phải</p>
          </div>
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={save} disabled={!!busy}>
                <Icon name="check" size={15} /> {busy === "save" ? "Đang lưu…" : "Lưu luật"}
              </button>
              <button className="btn-outline" onClick={recompute} disabled={!!busy}>
                <Icon name="refresh" size={15} /> {busy === "re" ? "Đang tính…" : "Tính lại ngay"}
              </button>
              <button className="btn-ghost" disabled={!!busy} onClick={() => setR(SCORING_DEFAULT)}>
                Về mặc định
              </button>
            </div>
          )}
          {!canEdit && <p className="mt-3 text-[13px] text-ink-2">Chỉ chủ workspace sửa được luật chấm điểm.</p>}
          {msg && (
            <p role="status" className={`mt-3 rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {msg.text}
            </p>
          )}
        </section>
      </div>

      <aside aria-label="Ví dụ" className="card h-fit p-5 lg:sticky lg:top-4">
        <h2 className="section-title">Ví dụ trực tiếp</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sp" className="label">
              Điểm hồ sơ
            </label>
            <input id="sp" type="number" min={0} max={100} className="input mt-1 tnum" value={profile} onChange={(e) => setProfile(Math.min(100, Math.max(0, num(e.target.value))))} />
          </div>
          <div>
            <label htmlFor="si" className="label">
              Ngày im lặng
            </label>
            <input id="si" type="number" min={0} className="input mt-1 tnum" value={idle} onChange={(e) => setIdle(Math.max(0, num(e.target.value)))} />
          </div>
        </div>
        <p className="mt-4 font-title text-[36px] font-semibold leading-none tnum">
          {ex.score}
          <span className="text-[15px] font-normal text-ink-2">/100</span>
        </p>
        <ul className="mt-3 grid gap-1 text-[13px]">
          <li className="flex justify-between gap-2">
            <span className="text-ink-2">Hồ sơ ({r.enabled ? `${r.profileWeight}% của ${profile}` : profile})</span>
            <span className="tnum">+{ex.base}</span>
          </li>
          {ex.parts.map((p) => (
            <li key={p.key} className="flex justify-between gap-2">
              <span className="text-ink-2">
                {p.label} ×{p.count}
              </span>
              <span className={`tnum ${p.points < 0 ? "text-danger" : "text-success"}`}>
                {p.points > 0 ? "+" : ""}
                {p.points}
              </span>
            </li>
          ))}
          {ex.decay > 0 && (
            <li className="flex justify-between gap-2">
              <span className="text-ink-2">{ex.idleWeeks} tuần im lặng</span>
              <span className="tnum text-danger">−{ex.decay}</span>
            </li>
          )}
        </ul>
      </aside>
    </div>
  );
}
