"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Logo } from "./Icon";
import { Avatar } from "./Avatar";
import { ago } from "@/lib/format";

type Note = { id: string; kind: "overdue" | "today" | "agent"; text: string; at: string; href: string };

export function Topbar({ workspace, user }: { workspace: string; user: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [seen, setSeen] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : []))
        .then(setNotes)
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    try {
      setSeen(localStorage.getItem("crm_seen") ?? "");
    } catch {}
    return () => clearInterval(t);
  }, []);

  const unread = notes.filter((n) => n.kind !== "agent" || n.at > seen).length;

  function openBell() {
    setBell(!bell);
    setMenu(false);
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem("crm_seen", now);
    } catch {}
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="flex h-12 flex-none items-center gap-2 px-4">
      <Link href="/w" className="flex items-center gap-2 font-title text-[16px] font-semibold">
        <Logo size={26} />
        <span className="hidden sm:inline">DNA CRM</span>
      </Link>
      <span className="hidden truncate text-[13px] text-ink-2 lg:inline">· {workspace}</span>
      <form
        className="relative ml-auto w-full max-w-[320px]"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/w/b/contacts?q=${encodeURIComponent(q)}`);
        }}
      >
        <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
        <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách, số điện thoại..." className="input h-8 bg-surface pl-8" />
      </form>
      <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={() => window.dispatchEvent(new Event("copilot:open"))}>
        <Icon name="spark" size={16} className="text-[#a25ddc]" /> Trợ lý AI
      </button>

      <div className="relative">
        <button type="button" onClick={openBell} className="btn-ghost relative h-8 w-8 justify-center p-0" aria-label={`Thông báo (${unread})`}>
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#df2f4a] px-1 text-[10px] font-semibold text-white">{unread}</span>}
        </button>
        {bell && (
          <div className="absolute right-0 top-10 z-50 w-[340px] max-w-[calc(100vw-24px)] rounded-lg bg-surface p-2 shadow-panel">
            <p className="px-2 pb-2 pt-1 font-title text-[15px] font-semibold">Thông báo</p>
            {notes.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-ink-2">Không có gì mới.</p>}
            <ul className="max-h-[360px] overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setBell(false)} className="flex gap-2.5 rounded px-2 py-2 hover:bg-hover">
                    <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.kind === "overdue" ? "bg-[#df2f4a]" : n.kind === "today" ? "bg-[#fdab3d]" : "bg-[#a25ddc]"}`} />
                    <span className="min-w-0 flex-1 text-[13.5px]">
                      {n.text}
                      <span className="block text-[12px] text-ink-2" suppressHydrationWarning>
                        {n.kind === "overdue" ? "Quá hạn" : n.kind === "today" ? "Hạn hôm nay" : ago(n.at)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative">
        <button type="button" onClick={() => { setMenu(!menu); setBell(false); }} aria-label="Tài khoản" className="rounded-full">
          <Avatar name={user} size={30} />
        </button>
        {menu && (
          <div className="absolute right-0 top-10 z-50 w-56 rounded-lg bg-surface p-1.5 shadow-panel">
            <p className="px-2.5 py-2 text-[13px] text-ink-2">{user}</p>
            <Link href="/w/settings" className="flex h-8 items-center gap-2 rounded px-2.5 hover:bg-hover">
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
