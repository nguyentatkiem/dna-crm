"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { toast } from "../ui/Toast";
import { tutorial, useTutorial } from "./store";

export const FAQ_URL = "https://github.com/nguyentatkiem/dna-crm#câu-hỏi-thường-gặp";

export default function HelpMenu({ onClose }: { onClose: () => void }) {
  const t = useTutorial();
  const [confirm, setConfirm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, []);
  useEffect(() => {
    if (t.boot && !t.checklist) void tutorial.refresh();
  }, [t.boot, t.checklist]);

  const act = (f: () => void) => () => {
    onClose();
    f();
  };
  // ↑ ↓ để di chuyển trong menu.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  async function reset() {
    onClose();
    const ok = await tutorial.patch({ reset: true });
    if (!ok) return toast("Chưa đặt lại được, thử lại sau", "error");
    await tutorial.refresh();
    tutorial.open("welcome");
  }

  const item = "flex min-h-9 w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13.5px] hover:bg-hover focus:bg-hover focus:outline-none";
  const c = t.checklist;

  return (
    <div ref={box} role="menu" aria-label="Trợ giúp" onKeyDown={onKey} className="anim-pop fixed left-3 right-3 top-12 z-50 max-h-[calc(100dvh-64px)] overflow-y-auto rounded-lg bg-surface p-1.5 shadow-panel sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-[320px]">
      <p className="section-title px-2.5 pb-1 pt-2">Hướng dẫn từng bước</p>
      {t.tours.map((tour) => {
        const done = t.progress.tours[tour.id] === "done";
        return (
          <button key={tour.id} type="button" role="menuitem" className={item} onClick={act(() => tutorial.begin(tour.id))}>
            <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${done ? "bg-success-soft text-success" : "bg-surface-2 text-ink-2"}`}>
              <Icon name={done ? "check" : tour.icon} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{tour.title}</span>
              <span className="block truncate text-[12px] text-ink-2">
                {tour.steps.length} bước · {tour.minutes} phút{done ? " · đã xem" : ""}
              </span>
            </span>
          </button>
        );
      })}
      <div className="my-1 h-px bg-line-soft" />
      <button type="button" role="menuitem" className={item} onClick={act(() => tutorial.open("checklist"))}>
        <Icon name="flag" size={16} className="flex-none text-ink-2" />
        <span className="flex-1">Danh sách bắt đầu</span>
        {c && <span className="tnum text-[12px] text-ink-2">{c.pct}%</span>}
      </button>
      <button type="button" role="menuitem" className={item} onClick={act(() => tutorial.open("shortcuts"))}>
        <Icon name="command" size={16} className="flex-none text-ink-2" />
        <span className="flex-1">Phím tắt</span>
      </button>
      <a role="menuitem" className={item} href={FAQ_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
        <Icon name="help" size={16} className="flex-none text-ink-2" />
        <span className="flex-1">Câu hỏi thường gặp</span>
        <Icon name="open" size={13} className="flex-none text-ink-2" />
      </a>
      {t.boot?.canTeam && (
        <Link role="menuitem" className={item} href="/w/settings/tutorial" onClick={onClose}>
          <Icon name="users" size={16} className="flex-none text-ink-2" />
          <span className="flex-1">Tiến độ làm quen của đội</span>
        </Link>
      )}
      <div className="my-1 h-px bg-line-soft" />
      {confirm ? (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]">
          <span className="min-w-0 flex-1">Xoá tiến độ hướng dẫn của bạn?</span>
          <button type="button" role="menuitem" className="btn-primary h-7 px-2.5 text-[12.5px]" onClick={() => void reset()}>
            Đặt lại
          </button>
          <button type="button" role="menuitem" className="btn-ghost h-7 px-2 text-[12.5px]" onClick={() => setConfirm(false)}>
            Thôi
          </button>
        </div>
      ) : (
        <button type="button" role="menuitem" className={`${item} text-ink-2`} onClick={() => setConfirm(true)}>
          <Icon name="refresh" size={16} className="flex-none" />
          <span className="flex-1">Bắt đầu lại hướng dẫn</span>
        </button>
      )}
    </div>
  );
}
