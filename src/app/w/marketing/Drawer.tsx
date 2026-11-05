"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

/** Ngăn kéo bên phải, giống Nguồn khách. Esc để đóng. */
export function Drawer({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label={title} className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-panel ${wide ? "max-w-[720px]" : "max-w-[540px]"}`}>
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-[20px] font-semibold">{title}</h2>
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </header>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </aside>
    </>
  );
}

/** Ô nhập khoá: hiện ••••1234 khi đã lưu, để trống = giữ nguyên. */
export function SecretField({ label, value, saved, onChange, hint, secret = true, placeholder }: { label: string; value: string; saved?: string; onChange: (v: string) => void; hint?: string; secret?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className="label">{label}</span>
      <input
        className="input font-mono text-[13px]"
        type={secret ? "password" : "text"}
        autoComplete="off"
        value={value}
        placeholder={saved ? `Đã lưu ${saved}${secret ? " · để trống nếu không đổi" : ""}` : placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-[12px] text-ink-2">{hint}</span>}
    </label>
  );
}

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid gap-2 text-[13.5px]">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-primary-selected text-[11.5px] font-semibold text-ink">{i + 1}</span>
          <span className="min-w-0 text-ink-2">{t}</span>
        </li>
      ))}
    </ol>
  );
}
