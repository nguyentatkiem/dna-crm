"use client";

import Link from "next/link";
import { InstallAppButton } from "./pwa/InstallAppButton";
import { clearPwaPages } from "./pwa/PwaRegister";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Logo } from "./Icon";
import { Avatar } from "./Avatar";
import { ago } from "@/lib/format";
import { getTheme, setTheme, THEME_EVENT, type Theme } from "./ui/theme";

type Note = { id: string; source: "notification" | "task" | "agent"; kind: string; text: string; at: string; href: string; read: boolean };

// ───── Giao diện sáng / tối / theo hệ thống ─────
export type ThemeMode = Theme;
const THEME_LABEL: Record<ThemeMode, string> = { light: "Sáng", dark: "Tối", system: "Theo hệ thống" };
const THEME_ICON: Record<ThemeMode, string> = { light: "sun", dark: "moon", system: "layout" };

// ───── Biểu tượng theo loại thông báo ─────
const KIND: Record<string, { icon: string; color: string; label: string }> = {
  message: { icon: "chat", color: "#0086c0", label: "Tin nhắn" },
  call: { icon: "phone", color: "#00c875", label: "Cuộc gọi" },
  task: { icon: "check", color: "#579bfc", label: "Việc" },
  lead: { icon: "person", color: "#a25ddc", label: "Khách" },
  system: { icon: "settings", color: "#676879", label: "Hệ thống" },
  overdue: { icon: "clock", color: "#df2f4a", label: "Quá hạn" },
  today: { icon: "clock", color: "#fdab3d", label: "Hạn hôm nay" },
  agent: { icon: "bot", color: "#a25ddc", label: "AI Agent" },
};
const kindOf = (k: string) => KIND[k] ?? KIND.system;

export function Topbar({ workspace, user, searchHref = "/w/b/contacts" }: { workspace: string; user: string; searchHref?: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [notes, setNotes] = useState<Note[]>([]);
  const [seen, setSeen] = useState("");
  const [q, setQ] = useState("");
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : []))
        .then((x) => Array.isArray(x) && setNotes(x))
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    try {
      setSeen(localStorage.getItem("crm_seen") ?? "");
    } catch {}
    setThemeState(getTheme());
    const onTheme = (e: Event) => setThemeState((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener(THEME_EVENT, onTheme);
    return () => {
      clearInterval(t);
      window.removeEventListener(THEME_EVENT, onTheme);
    };
  }, [load]);

  // Bấm ra ngoài thì đóng chuông / menu.
  useEffect(() => {
    if (!bell && !menu) return;
    const close = (e: MouseEvent) => {
      if (bell && !bellRef.current?.contains(e.target as Node)) setBell(false);
      if (menu && !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setBell(false), setMenu(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [bell, menu]);

  const isUnread = (n: Note) => (n.source === "agent" ? n.at > seen : !n.read);
  const unreadCount = notes.filter(isUnread).length;
  const list = tab === "unread" ? notes.filter(isUnread) : notes;
  const startOfDay = new Date(new Date().toDateString()).toISOString();
  const groups = [
    { key: "todo", label: "Cần làm", items: list.filter((n) => n.source === "task") },
    { key: "today", label: "Hôm nay", items: list.filter((n) => n.source !== "task" && n.at >= startOfDay) },
    { key: "older", label: "Trước đó", items: list.filter((n) => n.source !== "task" && n.at < startOfDay) },
  ].map((g) => ({ ...g, items: g.items.sort((a, b) => (g.key === "todo" ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at))) }));

  function markSeenAgents() {
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem("crm_seen", now);
    } catch {}
  }

  async function markAll() {
    markSeenAgents();
    setNotes((ns) => ns.map((n) => (n.source === "notification" ? { ...n, read: true } : n)));
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  }

  function openNote(n: Note) {
    setBell(false);
    if (n.source === "notification" && !n.read) {
      setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) }).catch(() => undefined);
    }
  }

  function cycleTheme() {
    const next: ThemeMode = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    setThemeState(next);
  }

  async function logout() {
    // Xoá các trang app điện thoại đã lưu để người sau dùng máy không thấy dữ liệu cũ.
    clearPwaPages();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex h-12 flex-none items-center gap-2 px-4">
      <Link href="/w" className="flex flex-none items-center gap-2 font-title text-[16px] font-semibold">
        <Logo size={26} />
        <span className="hidden sm:inline">DNA CRM</span>
      </Link>
      <span className="hidden truncate text-[13px] text-ink-2 lg:inline">· {workspace}</span>
      <form
        className="relative ml-auto w-full min-w-0 max-w-[320px]"
        onSubmit={(e) => {
          e.preventDefault();
          // Mở bảng lệnh Ctrl+K với từ khoá đã gõ (tìm khách, giao dịch, tài liệu, trang).
          window.dispatchEvent(new CustomEvent("palette:open", { detail: q }));
          setQ("");
        }}
      >
        <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
        <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách, số điện thoại... (Ctrl+K)" className="input h-8 bg-surface pl-8" onFocus={(e) => { if (!e.currentTarget.value) { e.currentTarget.blur(); window.dispatchEvent(new CustomEvent("palette:open")); } }} />
      </form>
      <button type="button" className="btn-ghost hidden flex-none sm:inline-flex" onClick={() => window.dispatchEvent(new Event("copilot:open"))}>
        <Icon name="spark" size={16} className="text-[#a25ddc]" /> Trợ lý AI
      </button>

      <button type="button" onClick={cycleTheme} className="btn-ghost h-8 w-8 flex-none justify-center p-0" aria-label={`Giao diện: ${THEME_LABEL[theme]}. Bấm để đổi`} title={`Giao diện: ${THEME_LABEL[theme]}`}>
        <Icon name={THEME_ICON[theme]} size={17} />
      </button>

      <InstallAppButton compact className="btn-ghost h-8 flex-none px-2" />

      <div ref={bellRef} className="relative flex-none">
        <button
          type="button"
          onClick={() => {
            setBell(!bell);
            setMenu(false);
            if (!bell) load();
          }}
          className="btn-ghost relative h-8 w-8 justify-center p-0"
          aria-label={`Thông báo (${unreadCount} chưa đọc)`}
          aria-expanded={bell}
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#df2f4a] px-1 text-[10px] font-semibold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
        {bell && (
          <div className="fixed left-3 right-3 top-12 z-50 rounded-lg bg-surface shadow-panel sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-[380px]">
            <div className="flex items-center gap-2 px-3 pb-1 pt-3">
              <p className="flex-1 font-title text-[15px] font-semibold">Thông báo</p>
              <button type="button" onClick={markAll} disabled={unreadCount === 0} className="btn-ghost h-7 px-2 text-[12.5px] text-primary disabled:text-ink-2 disabled:opacity-60">
                <Icon name="check" size={14} /> Đã đọc tất cả
              </button>
            </div>
            <div className="flex gap-1 border-b border-line-soft px-3" role="tablist">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-2 py-2 text-[13px] ${tab === t ? "border-primary font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
                >
                  {t === "unread" ? `Chưa đọc${unreadCount ? ` (${unreadCount})` : ""}` : "Tất cả"}
                </button>
              ))}
            </div>
            <div className="max-h-[min(440px,calc(100vh-140px))] overflow-y-auto p-1.5">
              {list.length === 0 && (
                <div className="grid place-items-center gap-1.5 px-2 py-10 text-center">
                  <Icon name="bell" size={26} className="text-ink-2" />
                  <p className="text-[13.5px] font-semibold">{tab === "unread" ? "Bạn đã xem hết thông báo" : "Chưa có thông báo nào"}</p>
                  <p className="text-[12.5px] text-ink-2">Khi được giao khách, giao việc hoặc sắp đến hạn, thông báo sẽ hiện ở đây.</p>
                </div>
              )}
              {groups.map(
                (g) =>
                  g.items.length > 0 && (
                    <section key={g.key} className="mb-1">
                      <p className="px-2 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-2">{g.label}</p>
                      <ul>
                        {g.items.map((n) => {
                          const k = kindOf(n.kind);
                          const unread = isUnread(n);
                          return (
                            <li key={`${n.source}-${n.id}`}>
                              <Link href={n.href} onClick={() => openNote(n)} className="flex gap-2.5 rounded px-2 py-2 hover:bg-hover">
                                <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full text-white" style={{ background: k.color }}>
                                  <Icon name={k.icon} size={14} />
                                </span>
                                <span className={`min-w-0 flex-1 text-[13.5px] ${unread ? "font-medium text-ink" : "text-ink-2"}`}>
                                  <span className="line-clamp-2 break-words">{n.text}</span>
                                  <span className="block text-[12px] font-normal text-ink-2" suppressHydrationWarning>
                                    {k.label} · {n.source === "task" ? (n.kind === "overdue" ? "Quá hạn" : "Hạn hôm nay") : ago(n.at)}
                                  </span>
                                </span>
                                {unread && <span className="mt-2 h-2 w-2 flex-none rounded-full bg-primary" aria-label="Chưa đọc" />}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ),
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={menuRef} className="relative flex-none">
        <button
          type="button"
          onClick={() => {
            setMenu(!menu);
            setBell(false);
          }}
          aria-label="Tài khoản"
          aria-expanded={menu}
          className="rounded-full"
        >
          <Avatar name={user} size={30} />
        </button>
        {menu && (
          <div className="absolute right-0 top-10 z-50 w-60 rounded-lg bg-surface p-1.5 shadow-panel">
            <p className="truncate px-2.5 py-2 text-[13px] text-ink-2">{user}</p>
            <div className="px-2.5 pb-2">
              <p className="mb-1 text-[12px] text-ink-2">Giao diện</p>
              <div className="grid grid-cols-3 gap-1 rounded bg-surface-2 p-0.5" role="radiogroup" aria-label="Giao diện">
                {(["light", "dark", "system"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={theme === m}
                    onClick={() => {
                      setTheme(m);
                      setThemeState(m);
                    }}
                    className={`flex h-7 items-center justify-center gap-1 rounded text-[12px] ${theme === m ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
                  >
                    <Icon name={THEME_ICON[m]} size={13} />
                    {m === "system" ? "Tự động" : THEME_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
            <Link href="/w/settings" onClick={() => setMenu(false)} className="flex h-8 items-center gap-2 rounded px-2.5 hover:bg-hover">
              <Icon name="settings" size={16} /> Cài đặt
            </Link>
            <button type="button" onClick={logout} className="flex h-8 w-full items-center gap-2 rounded px-2.5 hover:bg-hover">
              <Icon name="logout" size={16} /> Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
