"use client";

import { useId } from "react";

export type TabItem = { key: string; label: React.ReactNode; count?: number };

/** Hàng tab gạch chân kiểu monday. Điều khiển bằng `value`/`onChange`, hỗ trợ phím mũi tên. */
export function Tabs({ items, value, onChange, className = "" }: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string }) {
  const id = useId();
  function onKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
    onChange(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  }
  return (
    <div role="tablist" className={`no-scrollbar flex gap-1 overflow-x-auto border-b border-line-soft ${className}`}>
      {items.map((t, i) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            id={`${id}-${t.key}`}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex h-9 flex-none items-center gap-1.5 border-b-2 px-2.5 text-[14px] transition-colors ${on ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {t.label}
            {t.count != null && <span className="rounded-full bg-surface-2 px-1.5 text-[11.5px] text-ink-2 tnum">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
