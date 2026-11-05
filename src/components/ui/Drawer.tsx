"use client";

import { useEffect, useRef } from "react";
import { Icon } from "../Icon";

/**
 * Ngăn kéo trượt từ phải (hoặc từ dưới trên điện thoại khi side="bottom").
 * Đóng bằng Esc, bấm nền mờ hoặc nút X. Khoá cuộn trang khi mở.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  side = "right",
  width = 480,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  side?: "right" | "bottom";
  width?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const bottom = side === "bottom";
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="anim-fade absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={
          bottom
            ? "anim-slide-up absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface shadow-lg outline-none"
            : "anim-slide-right absolute bottom-0 right-0 top-0 flex w-full flex-col bg-surface shadow-lg outline-none"
        }
        style={bottom ? undefined : { maxWidth: width }}
      >
        {bottom && <span className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-line" />}
        {(title || subtitle) && (
          <header className="flex flex-none items-start gap-3 border-b border-line-soft px-5 py-3.5">
            <div className="min-w-0 flex-1">
              {title && <h2 className="truncate text-[17px] font-semibold">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="btn-ghost h-8 w-8 flex-none justify-center p-0" aria-label="Đóng">
              <Icon name="x" />
            </button>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex flex-none items-center justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
