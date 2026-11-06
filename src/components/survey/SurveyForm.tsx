"use client";

import { useState } from "react";
import { NPS_COLOR, RATING_LABEL, npsBucket, type Question } from "@/lib/survey/shared";

type Val = number | string | string[];

/**
 * Form khảo sát công khai (trang /s/...). `endpoint` null = xem trước trong trình soạn (không gửi).
 * Gửi xong hiện lời cảm ơn; 409 (đã gửi) cũng coi như xong.
 */
export function SurveyForm({ questions, endpoint, thankYou, done: initialDone = false }: { questions: Question[]; endpoint: string | null; thankYou: string; done?: boolean }) {
  const [vals, setVals] = useState<Record<string, Val>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(initialDone);
  const [msg, setMsg] = useState(thankYou);
  const set = (id: string, v: Val) => setVals((x) => ({ ...x, [id]: v }));

  if (done)
    return (
      <div className="mt-6 grid justify-items-center gap-2 rounded-xl bg-success-soft px-4 py-8 text-center text-success">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-success text-[28px] text-white">✓</span>
        <p className="text-[17px] font-semibold">{msg || "Cảm ơn bạn đã góp ý!"}</p>
        <p className="text-[13.5px] opacity-90">Ý kiến của bạn giúp chúng tôi phục vụ tốt hơn mỗi ngày.</p>
      </div>
    );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const miss = questions.find((q) => q.required && (vals[q.id] === undefined || vals[q.id] === "" || (Array.isArray(vals[q.id]) && !(vals[q.id] as string[]).length)));
    if (miss) return setErr(`Vui lòng trả lời: “${miss.label}”`);
    if (!endpoint) return setDone(true);
    setBusy(true);
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: vals }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      if (j.thankYou) setMsg(j.thankYou);
      return setDone(true);
    }
    if (r.status === 409) return setDone(true);
    setErr(j.error ?? "Không gửi được, bạn thử lại nhé");
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6">
      {questions.map((q, i) => (
        <fieldset key={q.id} className="grid gap-2.5">
          <legend className="mb-2.5 text-[15.5px] font-medium leading-snug">
            <span className="text-ink-2">{i + 1}. </span>
            {q.label}
            {q.required && <span className="text-danger"> *</span>}
          </legend>
          {q.type === "nps" && <NpsInput value={vals[q.id] as number | undefined} onChange={(v) => set(q.id, v)} />}
          {q.type === "rating" && <Stars value={(vals[q.id] as number) ?? 0} onChange={(v) => set(q.id, v)} />}
          {q.type === "choice" && (
            <div className="grid gap-2">
              {(q.options ?? []).map((o) => (
                <label key={o} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[14.5px] transition-colors ${vals[q.id] === o ? "border-primary bg-primary-selected" : "border-line hover:bg-[var(--row-hover)]"}`}>
                  <input type="radio" name={q.id} checked={vals[q.id] === o} onChange={() => set(q.id, o)} className="h-4 w-4 accent-[var(--primary)]" />
                  {o}
                </label>
              ))}
            </div>
          )}
          {q.type === "multi" && (
            <div className="grid gap-2">
              {(q.options ?? []).map((o) => {
                const cur = (vals[q.id] as string[]) ?? [];
                const on = cur.includes(o);
                return (
                  <label key={o} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[14.5px] transition-colors ${on ? "border-primary bg-primary-selected" : "border-line hover:bg-[var(--row-hover)]"}`}>
                    <input type="checkbox" checked={on} onChange={() => set(q.id, on ? cur.filter((x) => x !== o) : [...cur, o])} className="h-4 w-4 accent-[var(--primary)]" />
                    {o}
                  </label>
                );
              })}
            </div>
          )}
          {q.type === "text" && <textarea className="textarea min-h-[96px] text-[15px]" value={(vals[q.id] as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} maxLength={2000} placeholder="Chia sẻ của bạn…" />}
        </fieldset>
      ))}
      {err && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
          {err}
        </p>
      )}
      <button type="submit" className="btn-primary h-11 justify-center text-[15px]" disabled={busy}>
        {busy ? "Đang gửi…" : endpoint ? "Gửi câu trả lời" : "Gửi thử (xem trước)"}
      </button>
    </form>
  );
}

function NpsInput({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label="Điểm từ 0 đến 10">
        {Array.from({ length: 11 }, (_, n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(n)}
              className={`h-11 rounded-lg border text-[15px] font-semibold tnum transition-transform hover:scale-105 ${on ? "border-transparent text-white" : "border-line bg-surface"}`}
              style={on ? { background: NPS_COLOR[npsBucket(n)] } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-2">
        <span>0 – Chắc chắn không</span>
        <span>10 – Chắc chắn có</span>
      </div>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="grid justify-items-center gap-1">
      <div className="flex gap-1" role="radiogroup" aria-label="Số sao" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} sao: ${RATING_LABEL[n]}`} onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} className={`grid h-12 w-12 place-items-center rounded-lg text-[36px] leading-none transition-transform hover:scale-110 ${n <= shown ? "text-[#ffb800]" : "text-line"}`}>
            ★
          </button>
        ))}
      </div>
      <p className="h-5 text-[13.5px] text-ink-2">{RATING_LABEL[shown]}</p>
    </div>
  );
}
