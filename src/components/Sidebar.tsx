"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";

const BOARD_ICON: Record<string, string> = { contacts: "users", deals: "deals", appointments: "calendar" };

export function Sidebar({ workspace, industry, boards, openTasks }: { workspace: string; industry: string; boards: { key: string; label: string; count: number }[]; openTasks: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const item = (href: string, label: string, icon: string, count?: number) => {
    const on = href === "/w" ? path === "/w" : path.startsWith(href);
    return (
      <Link key={href} href={href} className={`flex h-8 items-center gap-2.5 rounded px-2.5 text-[14px] ${on ? "bg-primary-selected text-ink" : "text-ink hover:bg-hover"}`}>
        <Icon name={icon} size={17} className="flex-none text-ink-2" />
        <span className="truncate">{label}</span>
        {count != null && count > 0 && <span className="ml-auto text-[12px] text-ink-2 tnum">{count}</span>}
      </Link>
    );
  };

  const mobile = [
    ["/w", "Trang chủ"],
    ["/w/my-work", "Việc của tôi"],
    ...boards.map((b) => [`/w/b/${b.key}`, b.label]),
    ["/w/inbox", "Hộp thư"],
    ["/w/telesales", "Telesales"],
    ["/w/sources", "Nguồn khách"],
    ["/w/marketing", "Marketing"],
    ["/w/dashboards", "Dashboard"],
    ["/w/docs", "Tài liệu"],
    ["/w/automations", "Tự động hoá"],
    ["/w/agents", "AI Agent"],
    ["/w/settings", "DNA"],
  ];

  return (
    <>
    <nav className="flex flex-none gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Điều hướng">
      {mobile.map(([href, label]) => {
        const on = href === "/w" ? path === "/w" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={`flex h-8 flex-none items-center rounded-full px-3 text-[13.5px] ${on ? "bg-primary-selected" : "bg-surface"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
    <nav className="hidden w-[248px] flex-none flex-col gap-0.5 overflow-y-auto px-3 pb-4 pt-1 md:flex" aria-label="Điều hướng">
      {item("/w", "Trang chủ", "home")}
      {item("/w/my-work", "Việc của tôi", "work", openTasks)}
      <div className="my-2 border-t border-line" />
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-hover">
        <span className="grid h-6 w-6 place-items-center rounded bg-[#a25ddc] text-[11px] font-bold text-white">{workspace[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{workspace}</span>
          <span className="block truncate text-[11.5px] text-ink-2">{industry}</span>
        </span>
        <Icon name="chevron" size={15} className={`text-ink-2 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="grid gap-0.5 pl-2">{boards.map((b) => item(`/w/b/${b.key}`, b.label, BOARD_ICON[b.key] ?? "board", b.count))}</div>}
      <div className="my-2 border-t border-line" />
      {item("/w/inbox", "Hộp thư", "chat")}
      {item("/w/telesales", "Telesales", "phone")}
      {item("/w/sources", "Nguồn khách", "inbox")}
      {item("/w/marketing", "Marketing & ROAS", "megaphone")}
      <div className="my-2 border-t border-line" />
      {item("/w/dashboards", "Dashboard", "chart")}
      {item("/w/docs", "Tài liệu", "doc")}
      <div className="my-2 border-t border-line" />
      {item("/w/automations", "Tự động hoá", "bolt")}
      {item("/w/agents", "AI Agent", "bot")}
      {item("/w/settings", "DNA & Cấu hình", "dna")}
    </nav>
    </>
  );
}
