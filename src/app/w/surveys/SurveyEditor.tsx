"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SurveyForm } from "@/components/survey/SurveyForm";
import { QUESTION_TYPES, QUESTION_TYPE_LABEL, SURVEY_KINDS, SURVEY_KIND_LABEL, defaultQuestions, type Question, type QuestionType, type SurveyKind } from "@/lib/survey/shared";

export type SurveyDraft = { name: string; kind: SurveyKind; questions: Question[]; thankYou: string; active: boolean };

const newId = () => `q${Math.random().toString(36).slice(2, 8)}`;
const KIND_HINT: Record<SurveyKind, string> = {
  nps: "Hỏi khách có sẵn lòng giới thiệu không (0–10). Điểm NPS = % ủng hộ (9–10) − % phản đối (0–6).",
  csat: "Đo mức hài lòng sau một lần phục vụ bằng 1–5 sao.",
  custom: "Tự thiết kế câu hỏi: chọn một, chọn nhiều, trả lời tự do…",
};

/** Soạn khảo sát: loại, câu hỏi (kéo lên/xuống), bắt buộc, lời cảm ơn; xem trước ngay bên cạnh. */
export function SurveyEditor({ id, initial }: { id?: string; initial: SurveyDraft }) {
  const router = useRouter();
  const [d, setD] = useState<SurveyDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setQ = (i: number, patch: Partial<Question>) => setD((x) => ({ ...x, questions: x.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((x) => {
      const qs = [...x.questions];
      const j = i + dir;
      if (j < 0 || j >= qs.length) return x;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...x, questions: qs };
    });

  function pickKind(kind: SurveyKind) {
    // Đổi loại khi chưa sửa câu hỏi nào thì thay bộ câu hỏi mẫu.
    const untouched = JSON.stringify(d.questions.map(({ id: _, ...q }) => q)) === JSON.stringify(defaultQuestions(d.kind).map(({ id: _, ...q }) => q));
    setD({ ...d, kind, questions: untouched || !d.questions.length ? defaultQuestions(kind) : d.questions });
  }

  async function save() {
    setErr("");
    if (!d.name.trim()) return setErr("Nhập tên khảo sát");
    if (!d.questions.length) return setErr("Thêm ít nhất một câu hỏi");
    const bad = d.questions.find((q) => !q.label.trim() || ((q.type === "choice" || q.type === "multi") && !(q.options ?? []).filter((o) => o.trim()).length));
    if (bad) return setErr(bad.label.trim() ? `Câu “${bad.label}” cần ít nhất một lựa chọn` : "Có câu hỏi chưa có nội dung");
    setBusy(true);
    const body = { ...d, questions: d.questions.map((q) => ({ ...q, options: q.type === "choice" || q.type === "multi" ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })) };
    const r = await fetch(id ? `/api/surveys/${id}` : "/api/surveys", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    router.push(`/w/surveys/${j.id ?? id}`);
    router.refresh();
  }

  async function remove() {
    if (!id || !confirm("Xoá khảo sát này cùng mọi câu trả lời?")) return;
    const r = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
    if (r.ok) {
      router.push("/w/surveys");
      router.refresh();
    } else setErr((await r.json().catch(() => ({}))).error ?? "Không xoá được");
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="card grid gap-3 p-4">
          <label className="grid gap-1">
            <span className="label">Tên khảo sát</span>
            <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={120} placeholder="VD: Khảo sát NPS sau liệu trình" autoFocus={!id} />
          </label>
          <div className="grid gap-1">
            <span className="label">Loại</span>
            <div className="flex flex-wrap gap-2">
              {SURVEY_KINDS.map((k) => (
                <button key={k} type="button" onClick={() => pickKind(k)} className={`rounded-lg border px-3 py-1.5 text-[13.5px] ${d.kind === k ? "border-primary bg-primary-selected font-medium" : "border-line"}`}>
                  {SURVEY_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <span className="text-[12.5px] text-ink-2">{KIND_HINT[d.kind]}</span>
          </div>
        </section>

        <section className="card grid gap-3 p-4">
          <h2 className="section-title">Câu hỏi</h2>
          {d.questions.map((q, i) => (
            <div key={q.id} className="grid gap-2 rounded-lg border border-line-soft p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary-selected text-[12px] font-semibold text-primary">{i + 1}</span>
                <select className="input h-8 w-auto text-[13px]" value={q.type} onChange={(e) => setQ(i, { type: e.target.value as QuestionType, options: e.target.value === "choice" || e.target.value === "multi" ? q.options?.length ? q.options : ["Lựa chọn 1", "Lựa chọn 2"] : undefined })} aria-label="Loại câu hỏi">
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-2">
                  <input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" /> Bắt buộc
                </label>
                <button type="button" className="btn-ghost h-7 px-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Đưa lên">
                  ↑
                </button>
                <button type="button" className="btn-ghost h-7 px-1.5" onClick={() => move(i, 1)} disabled={i === d.questions.length - 1} aria-label="Đưa xuống">
                  ↓
                </button>
                <button type="button" className="btn-ghost h-7 px-1.5 text-danger" onClick={() => setD({ ...d, questions: d.questions.filter((_, j) => j !== i) })} aria-label="Xoá câu hỏi">
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <input className="input" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} maxLength={300} placeholder="Nội dung câu hỏi" aria-label={`Câu hỏi ${i + 1}`} />
              {(q.type === "choice" || q.type === "multi") && (
                <div className="grid gap-1.5 pl-2">
                  {(q.options ?? []).map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-ink-2">{q.type === "choice" ? "○" : "☐"}</span>
                      <input className="input h-8 text-[13.5px]" value={o} maxLength={120} onChange={(e) => setQ(i, { options: (q.options ?? []).map((x, m) => (m === k ? e.target.value : x)) })} aria-label={`Lựa chọn ${k + 1}`} />
                      <button type="button" className="btn-ghost h-7 px-1.5" onClick={() => setQ(i, { options: (q.options ?? []).filter((_, m) => m !== k) })} aria-label="Xoá lựa chọn">
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                  {(q.options ?? []).length < 20 && (
                    <button type="button" className="btn-ghost h-7 w-fit text-[13px]" onClick={() => setQ(i, { options: [...(q.options ?? []), `Lựa chọn ${(q.options ?? []).length + 1}`] })}>
                      <Icon name="plus" size={13} /> Thêm lựa chọn
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {d.questions.length < 30 && (
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPES.map((t) => (
                <button key={t} type="button" className="btn-outline h-8 text-[13px]" onClick={() => setD({ ...d, questions: [...d.questions, { id: newId(), type: t, label: "", options: t === "choice" || t === "multi" ? ["Lựa chọn 1", "Lựa chọn 2"] : undefined }] })}>
                  <Icon name="plus" size={13} /> {QUESTION_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card grid gap-3 p-4">
          <label className="grid gap-1">
            <span className="label">Lời cảm ơn sau khi gửi</span>
            <input className="input" value={d.thankYou} onChange={(e) => setD({ ...d, thankYou: e.target.value })} maxLength={500} />
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" /> Đang nhận câu trả lời
          </label>
        </section>

        {err && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
            {err}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={15} /> {busy ? "Đang lưu…" : id ? "Lưu khảo sát" : "Tạo khảo sát"}
          </button>
          <Link href={id ? `/w/surveys/${id}` : "/w/surveys"} className="btn-ghost">
            Huỷ
          </Link>
          {id && (
            <button type="button" className="btn-ghost ml-auto text-danger" onClick={remove}>
              <Icon name="trash" size={15} /> Xoá
            </button>
          )}
        </div>
      </div>

      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <p className="label mb-2 flex items-center gap-1.5">
          <Icon name="eye" size={14} /> Khách sẽ thấy
        </p>
        <div className="rounded-2xl border border-line-soft bg-bg p-3">
          <div className="rounded-xl bg-surface p-4 shadow-card">
            <h3 className="text-[18px] font-semibold leading-tight">{d.name || "Tên khảo sát"}</h3>
            <SurveyForm key={`${JSON.stringify(d.questions)}-${d.thankYou}`} questions={d.questions.filter((q) => q.label.trim())} endpoint={null} thankYou={d.thankYou} />
          </div>
        </div>
      </aside>
    </div>
  );
}
