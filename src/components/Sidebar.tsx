"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Drawer } from "./ui/Drawer";
import { SIDEBAR_KEY } from "./ui/theme";

const BOARD_ICON: Record<string, string> = { contacts: "users", deals: "deals", appointments: "calendar" };

export type NavBoard = { key: string; label: string; count: number };
export type NavItem = { href: string; label: string; icon: string; count?: number; badge?: number };
export type NavSection = { title: string; items: NavItem[] };

/** Danh sách trang trong sidebar — bảng lệnh Ctrl+K dùng lại danh sách này. */
export function navSections(boards: NavBoard[], counts: { openTasks?: number; unread?: number } = {}): NavSection[] {
  return [
    {
      title: "Làm việc",
      items: [
        { href: "/w", label: "Trang chủ", icon: "home" },
        { href: "/w/my-work", label: "Việc của tôi", icon: "work", count: counts.openTasks },
        { href: "/w/inbox", label: "Hộp thư", icon: "chat", badge: counts.unread },
        { href: "/w/feed", label: "Bảng tin", icon: "feed" },
        { href: "/w/dashboards", label: "Dashboard", icon: "chart" },
        { href: "/w/kpi", label: "KPI", icon: "target" },
        { href: "/w/perf/overview", label: "Hiệu suất nhân viên", icon: "award" },
      ],
    },
    { title: "Bảng", items: boards.map((b) => ({ href: `/w/b/${b.key}`, label: b.label, icon: BOARD_ICON[b.key] ?? "board", count: b.count })) },
    {
      title: "Bán hàng",
      items: [
        { href: "/w/products", label: "Sản phẩm", icon: "box" },
        { href: "/w/quotes", label: "Báo giá", icon: "receipt" },
        { href: "/w/orders", label: "Đơn hàng", icon: "cart" },
        { href: "/w/contracts", label: "Hợp đồng", icon: "contract" },
        { href: "/w/telesales", label: "Telesales", icon: "phone" },
      ],
    },
    {
      title: "Chăm sóc",
      items: [
        { href: "/w/tickets", label: "Phiếu hỗ trợ", icon: "ticket" },
        { href: "/w/loyalty", label: "Khách thân thiết", icon: "award" },
        { href: "/w/warranty", label: "Bảo hành", icon: "shield" },
        { href: "/w/surveys", label: "Khảo sát", icon: "chart" },
        { href: "/w/vouchers", label: "Voucher", icon: "gift" },
        { href: "/w/duplicates", label: "Hồ sơ trùng lặp", icon: "copy" },
      ],
    },
    {
      title: "Marketing",
      items: [
        { href: "/w/sources", label: "Nguồn khách", icon: "inbox" },
        { href: "/w/segments", label: "Nhóm khách", icon: "segment" },
        { href: "/w/rfm", label: "Phân tích RFM", icon: "pie" },
        { href: "/w/broadcasts", label: "Gửi hàng loạt", icon: "send" },
        { href: "/w/landing", label: "Landing page", icon: "page" },
        { href: "/w/funnel", label: "Phễu chuyển đổi", icon: "funnel" },
        { href: "/w/marketing", label: "Marketing & ROAS", icon: "megaphone" },
      ],
    },
    {
      title: "Công cụ",
      items: [
        { href: "/w/docs", label: "Tài liệu", icon: "doc" },
        { href: "/w/automations", label: "Tự động hoá", icon: "bolt" },
        { href: "/w/agents", label: "AI Agent", icon: "bot" },
      ],
    },
    { title: "Cài đặt", items: [{ href: "/w/settings", label: "DNA & Cấu hình", icon: "dna" }] },
  ];
}

/** Khoá data-tour cho hướng dẫn: "/w/my-work" → "nav-my-work", "/w" → "nav-home", "/w/settings" → "nav-settings". */
const tourKey = (href: string) => `nav-${href === "/w" ? "home" : href.slice(3).replace(/\//g, "-")}`;
const isOn = (path: string, href: string) => (href === "/w" ? path === "/w" : path === href || path.startsWith(href + "/") || path.startsWith(href + "?"));
const openPalette = () => window.dispatchEvent(new Event("palette:open"));

export function Sidebar({ workspace, industry, boards, openTasks, unread = 0 }: { workspace: string; industry: string; boards: NavBoard[]; openTasks: number; unread?: number }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(true);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const [more, setMore] = useState(false);
  const [mac, setMac] = useState(false);
  const sections = navSections(boards, { openTasks, unread });

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  useEffect(() => setMore(false), [path]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    setTip(null);
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {}
  }

  const showTip = (label: string) => (e: React.MouseEvent | React.FocusEvent) => {
    if (!collapsed) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 });
  };
  const hideTip = () => setTip(null);

  const item = (it: NavItem) => {
    const on = isOn(path, it.href);
    const n = it.badge || it.count;
    return (
      <Link
        key={it.href}
        href={it.href}
        data-tour={tourKey(it.href)}
        aria-current={on ? "page" : undefined}
        aria-label={collapsed ? it.label : undefined}
        onMouseEnter={showTip(it.label + (it.badge ? ` · ${it.badge} chưa đọc` : ""))}
        onMouseLeave={hideTip}
        onFocus={showTip(it.label)}
        onBlur={hideTip}
        className={`sb-item relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors ${on ? "bg-primary-selected font-medium text-ink" : "text-ink hover:bg-hover"}`}
      >
        <Icon name={it.icon} size={17} className={`flex-none ${on ? "text-primary" : "text-ink-2"}`} />
        <span className="sb-text min-w-0 flex-1 truncate">{it.label}</span>
        {it.badge ? <span className="sb-text count-dot">{it.badge > 99 ? "99+" : it.badge}</span> : n ? <span className="sb-text text-[12px] text-ink-2 tnum">{n}</span> : null}
        {it.badge ? <span className="sb-only-collapsed absolute right-2 top-1 h-2 w-2 rounded-full bg-danger" /> : null}
      </Link>
    );
  };

  const [work, board, ...rest] = sections;

  return (
    <>
      {/* Máy tính: sidebar thu gọn được */}
      <nav data-tour="nav" className="sb hidden flex-none flex-col overflow-hidden md:flex" aria-label="Điều hướng">
        <div className="flex flex-none items-center gap-1 px-3 pb-2 pt-1">
          <button
            type="button"
            onClick={openPalette}
            onMouseEnter={showTip(`Tìm kiếm (${mac ? "⌘" : "Ctrl"}+K)`)}
            onMouseLeave={hideTip}
            className="sb-item flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line-soft bg-surface px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line"
            aria-label="Tìm hoặc mở bảng lệnh"
          >
            <Icon name="search" size={15} className="flex-none" />
            <span className="sb-text min-w-0 flex-1 truncate text-left">Tìm nhanh</span>
            <span className="sb-text kbd" suppressHydrationWarning>
              {mac ? "⌘K" : "Ctrl K"}
            </span>
          </button>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          <Section title={work.title}>{work.items.map(item)}</Section>

          <div className="mt-3">
            <button type="button" onClick={() => setBoardsOpen(!boardsOpen)} className="sb-text group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-hover" aria-expanded={boardsOpen}>
              <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-accent text-[11px] font-bold text-white">{workspace[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{workspace}</span>
                {industry && <span className="block truncate text-[11.5px] text-ink-2">{industry}</span>}
              </span>
              <Icon name="chevron" size={15} className={`text-ink-2 transition-transform ${boardsOpen ? "" : "-rotate-90"}`} />
            </button>
            <div className="sb-only-collapsed mx-auto my-1 h-px w-6 bg-line" />
            {(boardsOpen || collapsed) && <div className="mt-0.5 grid gap-0.5">{board.items.map(item)}</div>}
          </div>

          {rest.map((s) => (
            <Section key={s.title} title={s.title}>
              {s.items.map(item)}
            </Section>
          ))}
        </div>

        <div className="flex-none border-t border-line-soft px-3 py-2">
          <button
            type="button"
            onClick={toggle}
            onMouseEnter={showTip("Mở rộng thanh bên")}
            onMouseLeave={hideTip}
            className="sb-item flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
            aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
            aria-pressed={collapsed}
          >
            <Icon name="chevron" size={16} className={`flex-none transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
            <span className="sb-text">Thu gọn</span>
          </button>
        </div>
      </nav>

      {tip && collapsed && (
        <span role="tooltip" className="anim-fade pointer-events-none fixed left-[64px] z-[70] -translate-y-1/2 whitespace-nowrap rounded-md bg-[#323338] px-2.5 py-1.5 text-[12.5px] font-medium text-white shadow-md" style={{ top: tip.top }}>
          {tip.label}
        </span>
      )}

      {/* Điện thoại: thanh điều hướng dưới cùng */}
      <nav data-tour="mobile-nav" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface md:hidden" aria-label="Điều hướng nhanh">
        <div className="grid h-14 grid-cols-5">
          {[
            { href: "/w", label: "Trang chủ", icon: "home" },
            { href: "/w/inbox", label: "Hộp thư", icon: "chat", badge: unread },
            { href: "/w/telesales", label: "Telesales", icon: "phone" },
            { href: "/w/my-work", label: "Việc", icon: "work", badge: 0 },
          ].map((it) => {
            const on = isOn(path, it.href);
            return (
              <Link key={it.href} href={it.href} data-tour={`m${tourKey(it.href)}`} aria-current={on ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-semibold text-primary" : "text-ink-2"}`}>
                <span className="relative">
                  <Icon name={it.icon} size={21} />
                  {it.badge ? <span className="count-dot absolute -right-2.5 -top-1.5">{it.badge > 99 ? "99+" : it.badge}</span> : null}
                </span>
                {it.label}
              </Link>
            );
          })}
          <button type="button" data-tour="mnav-more" onClick={() => setMore(true)} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${more ? "font-semibold text-primary" : "text-ink-2"}`} aria-haspopup="dialog">
            <Icon name="grip" size={21} />
            Thêm
          </button>
        </div>
      </nav>

      <Drawer open={more} onClose={() => setMore(false)} side="bottom" title={workspace} subtitle={industry || undefined}>
        <div className="grid gap-4 px-4 pb-6 pt-3">
          <button type="button" onClick={() => { setMore(false); openPalette(); }} className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-[14px] text-ink-2">
            <Icon name="search" size={16} /> Tìm khách, trang, hành động…
          </button>
          {sections.map((s) => (
            <div key={s.title}>
              <p className="section-title mb-1.5 px-1">{s.title}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {s.items.map((it) => {
                  const on = isOn(path, it.href);
                  return (
                    <Link key={it.href} href={it.href} className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center text-[12.5px] ${on ? "border-primary bg-primary-selected" : "border-line-soft bg-surface"}`}>
                      <Icon name={it.icon} size={20} className={on ? "text-primary" : "text-ink-2"} />
                      <span className="line-clamp-2 leading-tight">{it.label}</span>
                      {it.badge ? <span className="count-dot absolute right-1.5 top-1.5">{it.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 grid gap-0.5 first:mt-0">
      <p className="sb-text section-title px-2.5 pb-1">{title}</p>
      <div className="sb-only-collapsed mx-auto my-1 h-px w-6 bg-line" />
      {children}
    </div>
  );
}
