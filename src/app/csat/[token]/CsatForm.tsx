"use client";

import { useState } from "react";

const LABELS = ["", "Rất không hài lòng", "Chưa hài lòng", "Bình thường", "Hài lòng", "Rất hài lòng"];

export function CsatForm({ token, done: initialDone }: { token: string; done: boolean }) {
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(initialDone);

  if (done)
    return (
      <div className="mt-6 rounded-lg bg-success-soft p-4 text-center text-success">
        <p className="text-[28px]">♥</p>
        <p className="font-medium">Cảm ơn bạn đã đánh giá!</p>
        <p className="mt-1 text-[13.5px]">Ý kiến của bạn giúp chúng tôi phục vụ tốt hơn.</p>
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!score) return setErr("Chọn số sao trước nhé");
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/public/csat/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score, comment }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok || r.status === 409) return setDone(true);
    setErr(j.error ?? "Không gửi được, thử lại nhé");
  }

  const shown = hover || score;
  return (
    <form onSubmit={submit} className="mt-6 grid gap-4">
      <div className="grid justify-items-center gap-1">
        <div className="flex gap-1" role="radiogroup" aria-label="Số sao" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} sao: ${LABELS[n]}`}
              onClick={() => setScore(n)}
              onMouseEnter={() => setHover(n)}
              className={`grid h-12 w-12 place-items-center rounded-lg text-[34px] leading-none transition-transform hover:scale-110 ${n <= shown ? "text-[#ffb800]" : "text-line"}`}
            >
              ★
            </button>
          ))}
        </div>
        <p className="h-5 text-[13.5px] text-ink-2">{LABELS[shown]}</p>
      </div>
      <label className="grid gap-1">
        <span className="label">Góp ý thêm (không bắt buộc)</span>
        <textarea className="textarea min-h-[90px]" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} placeholder="Điều gì làm bạn hài lòng hoặc chưa hài lòng?" />
      </label>
      {err && (
        <p role="alert" className="text-[13px] text-danger">
          {err}
        </p>
      )}
      <button type="submit" className="btn-primary h-10 justify-center" disabled={busy}>
        {busy ? "Đang gửi…" : "Gửi đánh giá"}
      </button>
    </form>
  );
}
