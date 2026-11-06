"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { fold, money } from "@/lib/sales/shared";

export type LookupItem = { id: string; title: string; status: string; amount: number; ownerName: string; phone: string; email: string; contactId: string | null };
export type ProductOpt = { id: string; code: string; name: string; unit: string; category: string; price: number; vat: number };
export type CustomerCard = { contactId: string | null; recordId: string | null; name: string; phone: string; email: string };

/** Ô tìm có danh sách gợi ý thả xuống. Đóng khi bấm ra ngoài hoặc Esc. */
function Combo<T>({ placeholder, icon = "search", load, render, onPick, label }: { placeholder: string; icon?: string; label: string; load: (q: string) => Promise<T[]>; render: (x: T) => React.ReactNode; onPick: (x: T) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => load(q).then((xs) => live && (setItems(xs), setHi(0))), 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open, load]);
  useEffect(() => {
    const h = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const pick = (x: T) => {
    onPick(x);
    setQ("");
    setOpen(false);
  };
  return (
    <div ref={box} className="relative">
      <Icon name={icon} size={15} className="pointer-events-none absolute left-2.5 top-[11px] text-ink-2" />
      <input
        value={q}
        aria-label={label}
        placeholder={placeholder}
        className="input pl-8"
        onFocus={() => setOpen(true)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(h + 1, items.length - 1)));
          if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
          if (e.key === "Enter" && open && items[hi]) (e.preventDefault(), pick(items[hi]));
        }}
      />
      {open && items.length > 0 && (
        <ul role="listbox" className="anim-fade absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-panel">
          {items.map((x, i) => (
            <li key={i} role="option" aria-selected={i === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)} onMouseEnter={() => setHi(i)} className={`block w-full px-3 py-2 text-left text-[13.5px] ${i === hi ? "bg-hover" : ""}`}>
                {render(x)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const lookup = (object: "contacts" | "deals") => async (q: string) => {
  const r = await fetch(`/api/quotes/lookup?object=${object}&q=${encodeURIComponent(q)}`);
  return r.ok ? ((await r.json()).items as LookupItem[]) : [];
};
const loadContacts = lookup("contacts");
const loadDeals = lookup("deals");

/** Lấy thông tin khách của một giao dịch (qua _lien_he hoặc theo tên). */
export async function customerOfRecord(id: string): Promise<CustomerCard | null> {
  const r = await fetch(`/api/quotes/lookup?customerOf=${encodeURIComponent(id)}`);
  return r.ok ? ((await r.json()).customer as CustomerCard) : null;
}

export function ContactPicker({ onPick }: { onPick: (c: LookupItem) => void }) {
  return (
    <Combo
      label="Tìm khách"
      placeholder="Tìm khách theo tên, SĐT…"
      icon="person"
      load={loadContacts}
      onPick={onPick}
      render={(c) => (
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{c.title}</span>
          <span className="flex-none text-[12px] text-ink-2 tnum">{c.phone || c.email}</span>
        </span>
      )}
    />
  );
}

export function DealPicker({ onPick, label }: { onPick: (c: LookupItem) => void; label: string }) {
  return (
    <Combo
      label={`Tìm ${label.toLowerCase()}`}
      placeholder={`Gắn với ${label.toLowerCase()}…`}
      icon="deals"
      load={loadDeals}
      onPick={onPick}
      render={(c) => (
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{c.title}</span>
          <span className="flex-none text-[12px] text-ink-2 tnum">{c.amount ? money(c.amount) : c.ownerName}</span>
        </span>
      )}
    />
  );
}

export function ProductPicker({ products, onPick }: { products: ProductOpt[]; onPick: (p: ProductOpt) => void }) {
  const load = useRef(async (q: string) => {
    const f = fold(q.trim());
    return products.filter((p) => !f || fold(`${p.code} ${p.name} ${p.category}`).includes(f)).slice(0, 30);
  }).current;
  return (
    <Combo
      label="Thêm sản phẩm"
      placeholder={products.length ? "Thêm sản phẩm / dịch vụ…" : "Chưa có sản phẩm, hãy thêm dòng tự do"}
      icon="box"
      load={load}
      onPick={onPick}
      render={(p) => (
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block text-[12px] text-ink-2">{[p.code, p.category, p.unit].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="flex-none tnum">{money(p.price)}</span>
        </span>
      )}
    />
  );
}
