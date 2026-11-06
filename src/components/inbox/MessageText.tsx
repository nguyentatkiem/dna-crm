"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui";
import { splitPhones } from "@/lib/inbox-text";

/** Chép chữ: Clipboard API (chỉ có trên https/localhost), không có thì dùng cách cũ execCommand (CRM chạy http trong mạng LAN). */
async function copyText(t: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    // thử cách cũ bên dưới
  }
  try {
    const el = document.createElement("textarea");
    el.value = t;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

function PhoneChip({ raw, phone, onSave, light }: { raw: string; phone: string; onSave?: (phone: string) => void; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block whitespace-nowrap">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`rounded px-0.5 font-semibold underline decoration-dotted underline-offset-2 ${light ? "bg-white/20" : "bg-warning-soft text-ink"}`} title="Số điện thoại: bấm để chép, gọi hoặc lưu">
        {raw}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 flex w-44 flex-col rounded-lg border border-line bg-surface p-1 text-[13px] font-normal text-ink shadow-lg">
          <button
            type="button"
            className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
            onClick={() => {
              void copyText(phone).then((ok) => (ok ? toast(`Đã chép ${phone}`) : toast("Không chép được, hãy chép tay", "error")));
              setOpen(false);
            }}
          >
            <Icon name="copy" size={13} /> Chép số
          </button>
          <a href={`tel:${phone}`} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover" onClick={() => setOpen(false)}>
            <Icon name="phone" size={13} /> Gọi {phone}
          </a>
          {onSave && (
            <button
              type="button"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-hover"
              onClick={() => {
                onSave(phone);
                setOpen(false);
              }}
            >
              <Icon name="person" size={13} /> Lưu vào khách
            </button>
          )}
        </span>
      )}
    </span>
  );
}

/** Nội dung tin: SĐT được tô và bấm được (chép / gọi / lưu vào khách). */
export function MessageText({ text, onSavePhone, light }: { text: string; onSavePhone?: (phone: string) => void; light?: boolean }) {
  const parts = splitPhones(text);
  return (
    <>
      {parts.map((p, i) => (p.phone ? <PhoneChip key={i} raw={p.t} phone={p.phone} onSave={onSavePhone} light={light} /> : <span key={i}>{p.t}</span>))}
    </>
  );
}
