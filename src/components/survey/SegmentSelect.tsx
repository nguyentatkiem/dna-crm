"use client";

import { useEffect, useState } from "react";

type Seg = { id: string; name: string; objectKey: string; count: number };

/** Chọn một nhóm khách (bảng Khách) từ /api/segments. */
export function SegmentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [items, setItems] = useState<Seg[] | null>(null);
  useEffect(() => {
    fetch("/api/segments")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setItems((j.items as Seg[]).filter((s) => s.objectKey === "contacts")))
      .catch(() => setItems([]));
  }, []);
  if (items && !items.length) return <p className="text-[13px] text-ink-2">Chưa có nhóm khách. Lọc bảng Khách rồi bấm “Lưu thành nhóm khách”.</p>;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Nhóm khách">
      <option value="">{items ? "Chọn nhóm khách…" : "Đang tải…"}</option>
      {(items ?? []).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.count} khách)
        </option>
      ))}
    </select>
  );
}
