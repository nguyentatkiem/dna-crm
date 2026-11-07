"use client";

// Băng thông báo chatbot trong một hội thoại: số lần bot đã trả lời + tắt/bật bot cho riêng hội thoại.
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";

type Status = { enabled: boolean; off: boolean; replies: number; lastAt: string | null; handoffPending: boolean };

export function BotBanner({ convId, trigger }: { convId: string; trigger: string | number }) {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/kb/bot/conversation/${convId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setS(j))
      .catch(() => live && setS(null));
    return () => {
      live = false;
    };
  }, [convId, trigger]);

  async function toggle() {
    if (!s || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/kb/bot/conversation/${convId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ off: !s.off }) });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as Status;
      setS(j);
      toast(j.off ? "Đã tắt bot cho hội thoại này" : "Đã bật lại bot cho hội thoại này");
    } catch {
      toast("Không đổi được, thử lại nhé", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!s || !s.enabled || (!s.replies && !s.off && !s.handoffPending)) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft px-3 py-1.5 text-[12.5px] sm:px-4 ${s.off ? "bg-surface-2 text-ink-2" : "bg-info-soft text-ink"}`} role="status">
      <Icon name="bot" size={14} className={s.off ? "" : "text-info"} />
      <span>
        {s.off ? "Đã tắt trợ lý tự động cho hội thoại này" : s.replies ? `Trợ lý tự động đã trả lời ${s.replies} lần` : "Trợ lý tự động đang bật"}
        {s.handoffPending && !s.off ? " · đã chuyển cho nhân viên, chờ người trả lời" : ""}
      </span>
      <span className="text-ink-2">·</span>
      <button type="button" className="font-medium text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={toggle}>
        {s.off ? "Bật lại bot" : "Tắt bot cho hội thoại này"}
      </button>
    </div>
  );
}
