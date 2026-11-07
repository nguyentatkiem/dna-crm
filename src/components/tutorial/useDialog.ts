"use client";

import { useEffect, type RefObject } from "react";

/** Hộp thoại nhỏ: focus vào hộp khi mở, Esc để đóng, Tab xoay vòng trong hộp, trả focus khi đóng. */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void, trap = true) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      } else if (trap && e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        if (!f.length) return;
        const a = document.activeElement;
        if (!ref.current.contains(a) || (e.shiftKey && (a === f[0] || a === ref.current))) {
          e.preventDefault();
          f[e.shiftKey ? f.length - 1 : 0].focus();
        } else if (!e.shiftKey && a === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      } else if (trap) {
        // Hộp thoại chặn (lời chào): phím tắt của trang bên dưới (j k / Ctrl K…) không chạy.
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => {
      window.removeEventListener("keydown", k, true);
      if (prev && document.contains(prev)) prev.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
