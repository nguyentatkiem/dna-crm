"use client";

import { useState } from "react";

type Item = { productName: string; serial: string; startAt: string; endAt: string; status: string; statusLabel: string };
const d = (s: string) => new Date(s).toLocaleDateString("vi-VN");
const TONE: Record<string, string> = { active: "bg-success-soft text-success", claimed: "bg-warning-soft text-warning", expired: "bg-surface-2 text-ink-2" };

export function LookupForm({ formKey }: { formKey: string }) {
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/public/warranty/${formKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setItems(null);
      return setErr(j.error ?? "Không tra cứu được");
    }
    setItems(j.items);
  }

  return (
    <>
      <form onSubmit={submit} className="mt-5 flex gap-2 max-sm:flex-col">
        <input className="input h-10 min-w-0 flex-1 tnum" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ví dụ: 0901234567" aria-label="Số điện thoại" required />
        <button type="submit" className="btn-primary h-10 justify-center" disabled={busy}>
          {busy ? "Đang tra…" : "Tra cứu"}
        </button>
      </form>
      {err && (
        <p role="alert" className="mt-3 text-[13.5px] text-danger">
          {err}
        </p>
      )}
      {items && (
        <div className="mt-5 grid gap-2">
          {items.length === 0 ? (
            <p className="rounded-lg bg-surface-2 p-4 text-center text-[14px] text-ink-2">Không tìm thấy phiếu bảo hành nào với số điện thoại này.</p>
          ) : (
            items.map((w, i) => (
              <div key={i} className="rounded-lg border border-line-soft p-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words font-medium">{w.productName}</p>
                  <span className={`flex-none rounded-full px-2 py-0.5 text-[12px] font-medium ${TONE[w.status] ?? "bg-surface-2 text-ink-2"}`}>{w.statusLabel}</span>
                </div>
                {w.serial && <p className="mt-0.5 text-[13px] text-ink-2 tnum">Số serial: {w.serial}</p>}
                <p className="mt-0.5 text-[13px] text-ink-2 tnum">
                  Từ {d(w.startAt)} đến {d(w.endAt)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
