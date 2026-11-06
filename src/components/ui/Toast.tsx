"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Thông báo nổi dùng chung (cùng kiểu với thông báo của Bảng): gọi toast("Đã lưu") hoặc toast("Không lưu được", "error")
 * từ bất kỳ component client nào. <Toaster /> đặt một lần trong layout /w.
 */
type Tone = "info" | "error";
const EVENT = "app:toast";

export function toast(message: string, tone: Tone = "info") {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone } }));
}

export function Toaster() {
  const [t, setT] = useState<{ message: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; tone: Tone }>).detail;
      setT({ ...d, id: Date.now() });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setT(null), d.tone === "error" ? 5000 : 3000);
    };
    window.addEventListener(EVENT, h);
    return () => {
      window.removeEventListener(EVENT, h);
      clearTimeout(timer.current);
    };
  }, []);
  if (!t) return null;
  return (
    // Lớp ngoài canh giữa, lớp trong mới chạy hiệu ứng (transform của hiệu ứng không đè lên translate canh giữa).
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(128px+env(safe-area-inset-bottom))] z-[70] flex justify-center md:bottom-6">
      <div
        key={t.id}
        role={t.tone === "error" ? "alert" : "status"}
        className="anim-slide-up pointer-events-auto flex max-w-full items-center gap-3 rounded-lg bg-[#323338] px-4 py-2.5 text-[14px] text-white shadow-panel ring-1 ring-white/10"
      >
        {t.tone === "error" && <span className="h-2 w-2 flex-none rounded-full bg-[#ff5c6c]" aria-hidden="true" />}
        <span className="min-w-0">{t.message}</span>
        <button type="button" className="flex-none text-white/70 hover:text-white" aria-label="Đóng thông báo" onClick={() => setT(null)}>
          ✕
        </button>
      </div>
    </div>
  );
}
