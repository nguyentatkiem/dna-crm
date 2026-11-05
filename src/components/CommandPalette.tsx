"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { navSections, type NavBoard } from "./Sidebar";
import { resolvedTheme, toggleTheme } from "./ui/theme";
import { vnd } from "@/lib/format";

type Hit = {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: string;
  dot?: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};
type RecordHit = { id: string; title: string; objectKey: string; objectLabel: string; status: string; color: string; phone: string; amount: number; owner: string; href: string };
type DocHit = { id: string; title: string; snippet: string; href: string };

const RECENT_KEY = "crm_palette_recent";
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/**
 * Bảng lệnh Ctrl/Cmd+K: tìm khách, tài liệu, trang và chạy hành động nhanh.
 * Mở bằng phím tắt hoặc sự kiện window "palette:open" (ô tìm ở Topbar có thể gửi kèm detail = chuỗi tìm).
 */
export function CommandPalette({ boards, term }: { boards: NavBoard[]; term: { contact: string; deal: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<RecordHit[]>([]);
  const [docs, setDocs] = useState<DocHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<{ label: string; href: string; icon: string }[]>([]);
  const [mac, setMac] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const show = useCallback((initial?: string) => {
    setOpen(true);
    setQ(initial ?? "");
    setActive(0);
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
    } catch {}
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) setOpen(false);
        else show();
      }
    };
    const ev = (e: Event) => show(typeof (e as CustomEvent).detail === "string" ? (e as CustomEvent).detail : undefined);
    window.addEventListener("keydown", key);
    window.addEventListener("palette:open", ev);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("palette:open", ev);
    };
  }, [show]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  // Tìm trên máy chủ (chờ người dùng ngừng gõ một chút)
  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setRecords([]);
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { records: [], docs: [] }))
        .then((d) => {
          setRecords(d.records ?? []);
          setDocs(d.docs ?? []);
          setLoading(false);
        })
        .catch(() => undefined);
    }, 160);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, open]);

  const go = useCallback(
    (href: string, label: string, icon: string) => {
      setOpen(false);
      try {
        const next = [{ label, href, icon }, ...recent.filter((r) => r.href !== href)].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      router.push(href);
    },
    [recent, router],
  );

  const actions: Hit[] = useMemo(
    () => [
      { id: "a-new", group: "Hành động nhanh", label: `Thêm ${term.contact.toLowerCase()} mới`, icon: "plus", keywords: "them khach moi tao lead", run: () => go("/w/b/contacts", `Thêm ${term.contact.toLowerCase()} mới`, "plus") },
      { id: "a-call", group: "Hành động nhanh", label: "Gọi khách tiếp theo", sub: "Mở hàng chờ Telesales", icon: "phone", keywords: "goi dien telesales power dialer", run: () => go("/w/telesales", "Gọi khách tiếp theo", "phone") },
      {
        id: "a-ai",
        group: "Hành động nhanh",
        label: "Mở Trợ lý AI",
        sub: "Hỏi số liệu, thêm khách, tạo việc",
        icon: "spark",
        keywords: "copilot tro ly ai hoi",
        run: () => {
          setOpen(false);
          window.dispatchEvent(new Event("copilot:open"));
        },
      },
      {
        id: "a-theme",
        group: "Hành động nhanh",
        label: "Đổi giao diện sáng/tối",
        icon: "moon",
        keywords: "theme dark light toi sang giao dien",
        run: () => {
          toggleTheme();
          setOpen(false);
        },
      },
      { id: "a-task", group: "Hành động nhanh", label: "Xem việc quá hạn", icon: "clock", keywords: "viec qua han task", run: () => go("/w/my-work", "Việc của tôi", "work") },
      { id: "a-doc", group: "Hành động nhanh", label: "Tạo tài liệu", icon: "doc", keywords: "tai lieu doc ghi chu", run: () => go("/w/docs", "Tài liệu", "doc") },
    ],
    [go, term.contact],
  );

  const pages: Hit[] = useMemo(
    () =>
      navSections(boards).flatMap((s) =>
        s.items.map((it) => ({ id: `p-${it.href}`, group: "Trang", label: it.label, sub: s.title, icon: it.icon, keywords: it.href, run: () => go(it.href, it.label, it.icon) })),
      ),
    [boards, go],
  );

  const hits: Hit[] = useMemo(() => {
    const t = fold(q.trim());
    const match = (h: Hit) => !t || fold(`${h.label} ${h.sub ?? ""} ${h.keywords ?? ""}`).includes(t);
    if (!t) {
      const rec: Hit[] = recent.map((r) => ({ id: `r-${r.href}`, group: "Mở gần đây", label: r.label, icon: r.icon, run: () => go(r.href, r.label, r.icon) }));
      return [...rec, ...actions, ...pages.slice(0, 8)];
    }
    const rs: Hit[] = records.map((r) => ({
      id: `rec-${r.id}`,
      group: r.objectLabel,
      label: r.title,
      sub: [r.phone, r.amount ? vnd(r.amount) : "", r.owner].filter(Boolean).join(" · "),
      icon: r.objectKey === "contacts" ? "person" : r.objectKey === "deals" ? "deals" : r.objectKey === "appointments" ? "calendar" : "board",
      dot: r.color,
      hint: r.status,
      run: () => go(r.href, r.title, "person"),
    }));
    const ds: Hit[] = docs.map((d) => ({ id: `doc-${d.id}`, group: "Tài liệu", label: d.title, sub: d.snippet, icon: "doc", run: () => go(d.href, d.title, "doc") }));
    return [...rs, ...ds, ...actions.filter(match), ...pages.filter(match)];
  }, [q, recent, actions, pages, records, docs, go]);

  useEffect(() => setActive(0), [q, records.length, docs.length]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (hits.length ? (a + 1) % hits.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (hits.length ? (a - 1 + hits.length) % hits.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      hits[active]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  if (!open) return null;

  const groups: { name: string; items: { h: Hit; i: number }[] }[] = [];
  hits.forEach((h, i) => {
    const g = groups.find((x) => x.name === h.group);
    if (g) g.items.push({ h, i });
    else groups.push({ name: h.group, items: [{ h, i }] });
  });
  const dark = resolvedTheme() === "dark";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[8vh] sm:pt-[12vh]" role="presentation">
      <div className="anim-fade absolute inset-0 bg-overlay" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Bảng lệnh" className="anim-pop relative flex max-h-[min(560px,80vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-line-soft bg-surface shadow-lg">
        <div className="flex flex-none items-center gap-2.5 border-b border-line-soft px-4">
          <Icon name="search" size={18} className="flex-none text-ink-2" />
          <input
            ref={input}
            id="palette-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={`Tìm ${term.contact.toLowerCase()}, số điện thoại, ${term.deal.toLowerCase()}, tài liệu, trang…`}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-2 focus-visible:outline-none"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={hits[active] ? `pal-${active}` : undefined}
          />
          {loading && <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-line border-t-primary" aria-label="Đang tìm" />}
          <button type="button" onClick={close} className="kbd flex-none" aria-label="Đóng">
            Esc
          </button>
        </div>

        <div ref={list} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {hits.length === 0 && !loading && (
            <div className="px-4 py-10 text-center">
              <p className="font-medium">Không tìm thấy “{q}”</p>
              <p className="mt-1 text-[13px] text-ink-2">Thử tên khác, 4 số cuối điện thoại, hoặc gõ tên trang như “Telesales”.</p>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.name} className="mb-1" role="group" aria-label={g.name}>
              <p className="section-title px-2.5 pb-1 pt-2">{g.name}</p>
              {g.items.map(({ h, i }) => (
                <button
                  key={h.id}
                  id={`pal-${i}`}
                  data-i={i}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => h.run()}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${i === active ? "bg-primary-selected" : ""}`}
                >
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-surface-2 text-ink-2">
                    <Icon name={h.id === "a-theme" ? (dark ? "sun" : "moon") : h.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{h.label}</span>
                    {h.sub && <span className="block truncate text-[12.5px] text-ink-2">{h.sub}</span>}
                  </span>
                  {h.hint && (
                    <span className="hidden flex-none items-center gap-1.5 text-[12px] text-ink-2 sm:flex">
                      {h.dot && <span className="h-2 w-2 rounded-full" style={{ background: h.dot }} />}
                      {h.hint}
                    </span>
                  )}
                  {i === active && <span className="kbd hidden flex-none sm:inline-flex">↵</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <footer className="hidden flex-none items-center gap-4 border-t border-line-soft bg-surface-2 px-4 py-2 text-[12px] text-ink-2 sm:flex">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> chọn
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span> mở
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">Esc</span> đóng
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="kbd">{mac ? "⌘" : "Ctrl"}</span>
            <span className="kbd">K</span> mở bảng lệnh ở bất cứ đâu
          </span>
        </footer>
      </div>
    </div>
  );
}
