"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Skeleton, toast } from "@/components/ui";
import { viMessage } from "@/lib/format";
import { api } from "./shared";

type Q = { quality: number | null; qualityNote: string; sentiment: string; rules: { score: number; items: { key: string; label: string; delta: number }[]; firstResponseMs: number | null; unanswered: boolean } | null };

const mins = (ms: number) => (ms < 60e3 ? `${Math.round(ms / 1000)} giây` : ms < 3600e3 ? `${Math.round(ms / 60e3)} phút` : `${Math.round(ms / 360e4) / 10} giờ`);

/** Điểm chất lượng chăm sóc của hội thoại (API nhóm thống kê). Chỉ hiện cho người có quyền xem thống kê / mọi hội thoại. */
export function QualityCard({ convId, canRescore, version }: { convId: string; canRescore: boolean; version: string }) {
  const [q, setQ] = useState<Q | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    api<Q>(`/api/inbox/stats/quality?conv=${convId}`)
      .then((r) => live && (setQ(r), setErr(false)))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [convId, version]);
  async function rescore() {
    if (busy) return;
    setBusy(true);
    try {
      setQ(await api<Q>("/api/inbox/stats/quality", { method: "POST", json: { conv: convId } }));
      toast("Đã chấm lại");
    } catch (e) {
      toast(viMessage(e, "Không chấm lại được"), "error");
    } finally {
      setBusy(false);
    }
  }
  if (err) return null;
  const s = q?.quality;
  const tone = s == null ? "text-ink-2" : s >= 80 ? "text-success" : s >= 60 ? "text-warning" : "text-danger";
  return (
    <div className="card mt-3 p-3">
      <div className="flex items-center gap-2">
        <Icon name="award" size={15} className="text-ink-2" />
        <b className="flex-1 text-[13px]">Chất lượng chăm sóc</b>
        {!q ? <Skeleton className="h-5 w-10" /> : <span className={`text-[16px] font-semibold tnum ${tone}`}>{s ?? "—"}</span>}
      </div>
      {q?.sentiment === "negative" && <p className="mt-1.5 rounded bg-danger-soft px-2 py-1 text-[12px] text-danger">Khách đang bực: ưu tiên xử lý, xin lỗi và đưa hướng giải quyết.</p>}
      {q?.qualityNote && <p className="mt-1.5 text-[12.5px] text-ink-2">{q.qualityNote}</p>}
      {q?.rules && (
        <>
          <button type="button" className="mt-1.5 text-[12px] text-primary hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Ẩn chi tiết" : "Xem chi tiết"}
          </button>
          {open && (
            <ul className="mt-1 grid gap-0.5 text-[12px]">
              {q.rules.firstResponseMs != null && <li className="text-ink-2">Phản hồi đầu: {mins(q.rules.firstResponseMs)}</li>}
              {q.rules.unanswered && <li className="text-danger">Khách đang chờ trả lời</li>}
              {q.rules.items.map((i) => (
                <li key={i.key} className="flex gap-2">
                  <span className="min-w-0 flex-1">{i.label}</span>
                  <span className={`tnum ${i.delta < 0 ? "text-danger" : "text-success"}`}>{i.delta > 0 ? `+${i.delta}` : i.delta}</span>
                </li>
              ))}
              {!q.rules.items.length && <li className="text-ink-2">Không có điểm trừ.</li>}
            </ul>
          )}
        </>
      )}
      {canRescore && (
        <button type="button" className="btn-ghost mt-1.5 h-7 px-2 text-[12px]" disabled={busy} aria-busy={busy} onClick={rescore}>
          <Icon name="refresh" size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Đang chấm…" : "Chấm lại"}
        </button>
      )}
    </div>
  );
}
