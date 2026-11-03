"use client";

import Link from "next/link";
import { useState } from "react";
import { dateVi } from "@/lib/format";
import { Icon } from "@/components/Icon";

type T = { id: string; title: string; done: boolean; source: string; dueAt: string | null; record: { id: string; title: string; objectKey: string } | null };

const GROUPS = [
  { key: "overdue", label: "Quá hạn", color: "#df2f4a" },
  { key: "today", label: "Hôm nay", color: "#00c875" },
  { key: "week", label: "Tuần này", color: "#579bfc" },
  { key: "later", label: "Sau đó", color: "#a25ddc" },
  { key: "none", label: "Không có hạn", color: "#c4c4c4" },
  { key: "done", label: "Đã xong", color: "#9cd326" },
];

function bucket(t: T) {
  if (t.done) return "done";
  if (!t.dueAt) return "none";
  const start = new Date(new Date().toDateString()).getTime();
  const d = new Date(t.dueAt).getTime();
  if (d < start) return "overdue";
  if (d < start + 864e5) return "today";
  if (d < start + 7 * 864e5) return "week";
  return "later";
}

export function MyWork({ initial }: { initial: T[] }) {
  const [tasks, setTasks] = useState(initial);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  async function toggle(t: T) {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !t.done }) });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, dueAt: due ? new Date(due + "T09:00:00").toISOString() : null }) });
    if (res.ok) {
      const t = await res.json();
      setTasks((ts) => [{ ...t, record: null }, ...ts]);
      setTitle("");
      setDue("");
    }
  }

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Việc của tôi</h1>
      <p className="mt-1 text-ink-2">Việc do bạn, đồng nghiệp, tự động hoá và AI Agent tạo, gom theo thời hạn.</p>
      <form onSubmit={add} className="mt-4 flex flex-wrap gap-2">
        <input id="mw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thêm việc mới..." className="input max-w-md" />
        <input id="mw-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input w-44" aria-label="Hạn" />
        <button className="btn-primary h-9" disabled={!title.trim()}>
          <Icon name="plus" size={16} /> Thêm việc
        </button>
      </form>
      <div className="mt-6 grid gap-7">
        {GROUPS.map((g) => {
          const list = tasks.filter((t) => bucket(t) === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-2 flex items-center gap-2 text-[16px] font-semibold" style={{ color: g.color }}>
                {g.label} <span className="text-[13px] font-normal text-ink-2">{list.length} việc</span>
              </h2>
              <ul className="overflow-hidden rounded border border-line-soft" style={{ borderLeft: `6px solid ${g.color}` }}>
                {list.map((t) => (
                  <li key={t.id} className="flex h-10 items-center gap-3 border-b border-line-soft px-3 last:border-0 hover:bg-hover">
                    <input id={`mw-${t.id}`} type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4 accent-[#00c875]" aria-label="Đánh dấu xong" />
                    <span className={`min-w-0 flex-1 truncate ${t.done ? "text-ink-2 line-through" : ""}`}>{t.title}</span>
                    {t.record && (
                      <Link href={`/w/b/${t.record.objectKey}?open=${t.record.id}`} className="hidden max-w-[200px] truncate text-[13px] text-primary hover:underline sm:block">
                        {t.record.title}
                      </Link>
                    )}
                    <span className="hidden w-32 truncate text-[12.5px] text-ink-2 md:block">{t.source}</span>
                    <span className="w-14 text-right text-[12.5px] text-ink-2 tnum">{dateVi(t.dueAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {tasks.length === 0 && <p className="py-10 text-center text-ink-2">Chưa có việc nào. Thêm việc đầu tiên ở ô bên trên.</p>}
      </div>
    </div>
  );
}
