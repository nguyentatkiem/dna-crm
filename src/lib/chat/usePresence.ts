"use client";

// Hook cho trang Hộp thư: báo "đang trực" mỗi 60 giây khi tab đang mở, báo rời khi đóng tab.
// Dùng: const { online } = usePresence();  // online = danh sách người đang trực (cập nhật mỗi nhịp)
import { useEffect, useState } from "react";

export type PresenceDTO = { userId: string; name: string; at: string | null; online: boolean };

export const PRESENCE_EVERY_MS = 60_000;

export function usePresence(enabled = true): { online: PresenceDTO[]; all: PresenceDTO[] } {
  const [all, setAll] = useState<PresenceDTO[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const beat = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/inbox/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!r.ok) return;
        const j = (await r.json()) as { people?: PresenceDTO[] };
        if (alive && j.people) setAll(j.people);
      } catch {
        /* mất mạng: nhịp sau thử lại */
      }
    };
    const away = () => {
      try {
        navigator.sendBeacon?.("/api/inbox/presence", new Blob([JSON.stringify({ away: true })], { type: "application/json" }));
      } catch {
        /* bỏ qua */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void beat();
    };
    void beat();
    const t = setInterval(beat, PRESENCE_EVERY_MS);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", away);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", away);
    };
  }, [enabled]);
  return { online: all.filter((p) => p.online), all };
}
