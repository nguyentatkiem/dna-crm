"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dateVi } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/components/ui/Toast";

type T = { id: string; title: string; done: boolean; source: string; assignee: string; dueAt: string | null; record: { id: string; title: string; objectKey: string } | null };

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

/** Chọn người được giao: avatar nhỏ, bấm mở danh sách đội. */
function AssigneePicker({ value, team, onChange, compact }: { value: string; team: string[]; onChange: (v: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative flex-none">
      <button type="button" onClick={() => setOpen(!open)} className={compact ? "grid h-8 w-8 place-items-center rounded-full hover:bg-hover" : "btn-outline h-9"} aria-label={value ? `Giao cho ${value}` : "Chưa giao"} title={value || "Chưa giao"}>
        <Avatar name={value} size={compact ? 24 : 22} />
        {!compact && <span className="max-w-[120px] truncate">{value || "Giao cho..."}</span>}
      </button>
      {open && (
        <ul className="absolute right-0 top-10 z-40 max-h-64 w-56 overflow-y-auto rounded-lg bg-surface p-1.5 shadow-panel">
          {["", ...team].map((n) => (
            <li key={n || "_none"}>
              <button
                type="button"
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center gap-2 rounded px-2 text-left text-[13.5px] hover:bg-hover ${n === value ? "bg-hover font-semibold" : ""}`}
              >
                <Avatar name={n} size={22} />
                <span className="min-w-0 flex-1 truncate">{n || "Chưa giao"}</span>
                {n === value && <Icon name="check" size={14} className="text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyWork({ initial, me, team, who, canSeeAll, highlight }: { initial: T[]; me: string; team: string[]; who: string; canSeeAll: boolean; highlight: string | null }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(me);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (highlight) document.getElementById(`task-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight]);

  async function toggle(t: T) {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
    const r = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !t.done }) }).catch(() => null);
    // Lỗi thì trả lại như cũ và báo.
    if (!r?.ok) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: t.done } : x)));
      toast((await r?.json().catch(() => ({})))?.error ?? "Không cập nhật được việc", "error");
    }
  }

  async function reassign(t: T, name: string) {
    const prev = t.assignee;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, assignee: name } : x)));
    const r = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignee: name }) });
    if (!r.ok) {
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, assignee: prev } : x)));
      setErr((await r.json().catch(() => ({}))).error ?? "Không giao lại được");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setErr("");
    const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, assignee, dueAt: due ? new Date(due + "T09:00:00").toISOString() : null }) });
    const j = await res.json();
    if (res.ok) {
      setTasks((ts) => [{ ...j, record: null }, ...ts]);
      setTitle("");
      setDue("");
    } else setErr(j.error ?? "Không thêm được việc");
  }

  const filters = [
    { key: "mine", label: "Của tôi" },
    { key: "all", label: "Mọi người" },
    ...team.filter((n) => n !== me).map((n) => ({ key: n, label: n })),
  ];

  return (
    <div className="canvas px-4 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Việc của tôi</h1>
      <p className="mt-1 text-ink-2">
        {who === "all" ? "Việc của cả đội" : who === "mine" ? "Việc giao cho bạn, việc của khách bạn phụ trách và việc chưa giao" : `Việc giao cho ${who}`}, gom theo thời hạn.
      </p>

      {canSeeAll && (
        <div className="mt-4 flex max-w-full gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Lọc theo người">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={who === f.key}
              onClick={() => router.push(f.key === "mine" ? "/w/my-work" : `/w/my-work?who=${encodeURIComponent(f.key)}`)}
              className={`flex h-8 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] ${who === f.key ? "border-primary bg-primary-selected text-primary" : "border-line text-ink hover:bg-hover"}`}
            >
              {f.key !== "mine" && f.key !== "all" && <Avatar name={f.label} size={18} />}
              {f.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={add} className="mt-4 flex flex-wrap items-center gap-2">
        <input id="mw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thêm việc mới..." className="input min-w-0 max-w-md flex-1 basis-60" />
        <input id="mw-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input w-44" aria-label="Hạn" />
        <AssigneePicker value={assignee} team={team} onChange={setAssignee} />
        <button className="btn-primary h-9" disabled={!title.trim()}>
          <Icon name="plus" size={16} /> Thêm việc
        </button>
      </form>
      {err && <p className="mt-2 text-[13px] text-[#df2f4a]">{err}</p>}

      <div className="mt-6 grid gap-7">
        {GROUPS.map((g) => {
          const list = tasks.filter((t) => bucket(t) === g.key);
          if (!list.length) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-2 flex items-center gap-2 text-[16px] font-semibold" style={{ color: g.color }}>
                {g.label} <span className="text-[13px] font-normal text-ink-2">{list.length} việc</span>
              </h2>
              <ul className="rounded border border-line-soft" style={{ borderLeft: `6px solid ${g.color}` }}>
                {list.map((t) => (
                  <li key={t.id} id={`task-${t.id}`} className={`flex min-h-10 items-center gap-3 border-b border-line-soft px-3 py-1 last:border-0 hover:bg-hover ${highlight === t.id ? "bg-primary-selected" : ""}`}>
                    <input id={`mw-${t.id}`} type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4 flex-none accent-[#00c875]" aria-label="Đánh dấu xong" />
                    <span className={`min-w-0 flex-1 truncate ${t.done ? "text-ink-2 line-through" : ""}`}>{t.title}</span>
                    {t.record && (
                      <Link href={`/w/b/${t.record.objectKey}?open=${t.record.id}`} className="hidden max-w-[200px] truncate text-[13px] text-primary hover:underline sm:block">
                        {t.record.title}
                      </Link>
                    )}
                    <span className="hidden w-32 truncate text-[12.5px] text-ink-2 md:block">{t.source}</span>
                    <AssigneePicker value={t.assignee} team={team} onChange={(n) => reassign(t, n)} compact />
                    <span className="w-12 flex-none text-right text-[12.5px] text-ink-2 tnum">{dateVi(t.dueAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {tasks.length === 0 && (
          <div className="grid place-items-center gap-2 py-12 text-center">
            <Icon name="check" size={32} className="text-ink-2" />
            <p className="font-semibold">Chưa có việc nào</p>
            <p className="max-w-sm text-[14px] text-ink-2">Thêm việc ở ô bên trên, giao cho đồng nghiệp bằng nút avatar. Việc từ tự động hoá và AI Agent cũng hiện ở đây.</p>
          </div>
        )}
      </div>
    </div>
  );
}
