"use client";

// Nút "?" trên thanh trên cùng. Menu (danh sách tour, phím tắt…) tải lười khi mở lần đầu.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

const HelpMenu = dynamic(() => import("./HelpMenu"), {
  ssr: false,
  loading: () => <div className="absolute right-0 top-10 z-50 h-40 w-[300px] rounded-lg bg-surface shadow-panel" />,
});

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative flex-none">
      <button
        type="button"
        data-tour="help"
        onClick={() => setOpen(!open)}
        onPointerEnter={() => void import("./HelpMenu")}
        className="btn-ghost h-8 w-8 justify-center p-0"
        aria-label="Trợ giúp & hướng dẫn"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Trợ giúp & hướng dẫn"
      >
        <Icon name="help" size={18} />
      </button>
      {open && <HelpMenu onClose={() => setOpen(false)} />}
    </div>
  );
}
