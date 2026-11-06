"use client";

import { vnd } from "@/lib/format";

/** Biểu đồ cột gọn theo tiền (VND). `rows`: { label, value }. Vẽ bằng HTML thuần, không kéo thư viện biểu đồ. */
export function MiniBars({ rows, color = "#0073ea", height = 180, unit = "money" }: { rows: { label: string; value: number }[]; color?: string; height?: number; unit?: "money" | "count" }) {
  const fmt = (n: number) => (unit === "money" ? vnd(n) : n.toLocaleString("vi-VN"));
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <div style={{ height }} className="flex min-w-0 flex-col">
      <div className="relative flex min-h-0 flex-1 items-end gap-1.5 border-b border-line-soft">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-line-soft" style={{ bottom: `${f * 100}%` }} />
        ))}
        <span className="pointer-events-none absolute left-0 top-0 text-[11px] text-ink-2">{fmt(max)}</span>
        {rows.map((r) => (
          <div key={r.label} className="group relative flex h-full min-w-0 flex-1 items-end justify-center" title={`${r.label}: ${fmt(r.value)}`}>
            <div className="w-full max-w-[36px] rounded-t transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`, background: color }} />
            <span className="pointer-events-none absolute -top-6 z-10 hidden whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-[12px] text-ink shadow-panel group-hover:block">{fmt(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {rows.map((r) => (
          <span key={r.label} className="min-w-0 flex-1 truncate text-center text-[12px] text-ink-2">
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
