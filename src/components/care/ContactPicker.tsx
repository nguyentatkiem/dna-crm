"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

export type PickedContact = { id: string; title: string; phone: string };

/** Ô chọn khách: gõ tên hoặc SĐT, tìm qua /api/search (chỉ lấy bảng Khách). */
export function ContactPicker({ value, onChange, placeholder = "Tìm khách theo tên hoặc SĐT", id }: { value: PickedContact | null; onChange: (c: PickedContact | null) => void; placeholder?: string; id?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedContact[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return setHits([]);
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((x) => (x.ok ? x.json() : { records: [] })).catch(() => ({ records: [] }));
      setHits((r.records as { id: string; title: string; phone: string; objectKey: string }[]).filter((x) => x.objectKey === "contacts").slice(0, 8));
      setOpen(true);
    }, 220);
  }, [q]);

  if (value)
    return (
      <div className="flex h-9 items-center gap-2 rounded border border-line bg-surface px-3 text-[14px]">
        <Icon name="person" size={15} className="text-ink-2" />
        <span className="min-w-0 flex-1 truncate">
          {value.title}
          {value.phone && <span className="ml-1.5 text-ink-2 tnum">{value.phone}</span>}
        </span>
        <button type="button" className="text-ink-2 hover:text-ink" aria-label="Bỏ chọn khách" onClick={() => onChange(null)}>
          <Icon name="x" size={15} />
        </button>
      </div>
    );
  return (
    <div className="relative">
      <Icon name="search" size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} className="input pl-8" autoComplete="off" />
      {open && q.trim().length >= 2 && (
        <ul className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line-soft bg-surface py-1 shadow-panel" role="listbox">
          {hits.length === 0 && <li className="px-3 py-2 text-[13px] text-ink-2">Không thấy khách nào</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-hover" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(h); setQ(""); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                {h.phone && <span className="text-[12.5px] text-ink-2 tnum">{h.phone}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
