"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function Review({ id, transcript, owner, ai, review, note, reviewedBy }: { id: string; transcript: string; owner: boolean; ai: number | null; review: number | null; note: string; reviewedBy: string }) {
  const router = useRouter();
  const [text, setText] = useState(transcript);
  const [score, setScore] = useState(review ?? ai ?? 70);
  const [why, setWhy] = useState(note);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function patch(body: object, done: string) {
    setBusy(true);
    const r = await fetch(`/api/calls/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? done : j.error);
    if (r.ok) router.refresh();
  }

  return (
    <aside className="grid content-start gap-4">
      {owner ? (
        <section className="card grid gap-3 p-4">
          <h2 className="text-[15px] font-semibold">Quản lý chấm lại</h2>
          <p className="text-[13px] text-ink-2">Điểm của bạn được dùng làm chuẩn: AI học từ những lần bạn chấm lệch với nó.{reviewedBy && ` Lần cuối: ${reviewedBy}.`}</p>
          <label className="grid gap-1 text-[13.5px]">
            <span className="flex justify-between">
              Điểm của quản lý <b className="tnum">{score}/100</b>
            </span>
            <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
            <span className="text-[12px] text-ink-2">AI chấm: {ai ?? "–"}</span>
          </label>
          <label className="grid gap-1 text-[13.5px]">
            Vì sao chấm vậy?
            <textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="VD: Bạn ấy hỏi nhu cầu rất kỹ nhưng chưa chốt lịch cụ thể" />
          </label>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => patch({ reviewScore: score, reviewNote: why }, "Đã lưu điểm của quản lý.")}>
            Lưu điểm
          </button>
        </section>
      ) : (
        review != null && (
          <section className="card p-4 text-[14px]">
            Quản lý chấm: <b>{review}/100</b>
            {note && <p className="mt-1 text-ink-2">{note}</p>}
          </section>
        )
      )}
      <section className="card grid gap-2 p-4">
        <h2 className="text-[15px] font-semibold">Bản chép lời</h2>
        <textarea className="textarea font-mono text-[12.5px]" rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dán bản chép lời cuộc gọi..." aria-label="Bản chép lời" />
        <button type="button" className="btn-outline" disabled={busy || !text.trim()} onClick={() => patch({ transcript: text }, "Đã chấm lại theo bản chép lời mới.")}>
          {busy ? "Đang chấm..." : "Chấm điểm lại"}
        </button>
      </section>
      {msg && <p className="rounded bg-primary-selected px-3 py-2 text-[13.5px]">{msg}</p>}
    </aside>
  );
}
