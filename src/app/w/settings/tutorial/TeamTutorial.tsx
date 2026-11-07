"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/ui/Toast";
import { startTour } from "@/components/tutorial/store";
import { ago } from "@/lib/format";
import type { TutorialSettings } from "@/lib/tutorial/progress";

type Member = { userId: string; name: string; email: string; roleName: string; roleColor: string; joinedAt: string; pct: number; done: number; total: number; toursDone: string[]; welcomeSeen: boolean; completedAt: string | null; me: boolean };
type Data = { members: Member[]; tours: { id: string; title: string }[]; settings: TutorialSettings; canEdit: boolean };

function Toggle({ on, label, hint, disabled, onChange }: { on: boolean; label: string; hint: string; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" className="peer sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" className={`relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${on ? "bg-primary" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12.5px] text-ink-2">{hint}</span>
      </span>
    </label>
  );
}

export function TeamTutorial() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = () =>
    fetch("/api/tutorial/team", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Không tải được tiến độ");
        setD(j);
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function setSetting(patch: Partial<TutorialSettings>) {
    if (!d) return;
    setD({ ...d, settings: { ...d.settings, ...patch } });
    const r = await fetch("/api/tutorial/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) {
      toast((await r.json().catch(() => ({}))).error || "Chưa lưu được", "error");
      void load();
    } else toast("Đã lưu cài đặt hướng dẫn");
  }

  async function remind(m: Member) {
    setBusy(m.userId);
    const r = await fetch("/api/tutorial/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: m.userId }) });
    setBusy("");
    const j = await r.json().catch(() => ({}));
    toast(r.ok ? `Đã gửi nhắc tới ${m.name}` : j.error || "Chưa gửi được", r.ok ? "info" : "error");
  }

  if (err) return <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">{err}</p>;
  if (!d)
    return (
      <div className="mt-5 grid gap-3" aria-busy="true" aria-label="Đang tải">
        <div className="skeleton h-28" />
        <div className="skeleton h-64" />
      </div>
    );

  const title = Object.fromEntries(d.tours.map((t) => [t.id, t.title]));
  const avg = d.members.length ? Math.round(d.members.reduce((n, m) => n + m.pct, 0) / d.members.length) : 0;
  const doneCount = d.members.filter((m) => m.pct === 100).length;

  return (
    <>
      <section className="card mt-5 grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Toggle on={d.settings.welcomeForNewMembers} disabled={!d.canEdit} onChange={(v) => void setSetting({ welcomeForNewMembers: v })} label="Chào thành viên mới" hint="Lần đầu vào app hiện lời chào và mời đi một vòng hướng dẫn." />
        <Toggle on={d.settings.showChecklist} disabled={!d.canEdit} onChange={(v) => void setSetting({ showChecklist: v })} label="Hiện danh sách “Bắt đầu”" hint="Nút tròn góc trái dưới, tự đánh dấu khi làm thật." />
        <div className="flex items-center gap-2 lg:justify-end">
          <button type="button" className="btn-outline" onClick={() => startTour("lam-quen")}>
            <Icon name="play" size={14} /> Xem thử tour
          </button>
        </div>
        {!d.canEdit && <p className="text-[12.5px] text-ink-2 lg:col-span-3">Chỉ chủ workspace đổi được hai cài đặt này.</p>}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="card p-3">
          <p className="text-[12px] text-ink-2">Trung bình cả đội</p>
          <p className="font-title text-[22px] font-semibold tnum">{avg}%</p>
        </div>
        <div className="card p-3">
          <p className="text-[12px] text-ink-2">Đã làm quen xong</p>
          <p className="font-title text-[22px] font-semibold tnum">
            {doneCount}/{d.members.length}
          </p>
        </div>
      </div>

      <section className="card mt-4 overflow-hidden" aria-label="Tiến độ từng thành viên">
        <ul className="divide-y divide-[var(--line-soft)]">
          {d.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex min-w-[200px] flex-1 items-center gap-3">
                <Avatar name={m.name} size={34} />
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.name} {m.me && <span className="text-[12px] font-normal text-ink-2">(bạn)</span>}
                  </p>
                  <p className="truncate text-[12.5px] text-ink-2" suppressHydrationWarning>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: m.roleColor }} />
                    {m.roleName} · tham gia {ago(m.joinedAt)}
                    {!m.welcomeSeen && " · chưa mở app"}
                  </p>
                </div>
              </div>
              <div className="w-full min-w-[160px] sm:w-48">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink-2">
                    {m.done}/{m.total} việc
                  </span>
                  <b className={`tnum ${m.pct === 100 ? "text-success" : ""}`}>{m.pct}%</b>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={m.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ của ${m.name}`}>
                  <div className={`h-full rounded-full ${m.pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${m.pct}%` }} />
                </div>
              </div>
              <div className="flex min-w-[140px] flex-1 flex-wrap gap-1">
                {m.toursDone.length ? (
                  m.toursDone.map((id) => (
                    <span key={id} className="badge-success">
                      <Icon name="check" size={11} /> {title[id] ?? id}
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] text-ink-2">Chưa xem tour nào</span>
                )}
              </div>
              <button type="button" className="btn-outline h-8 flex-none text-[13px]" disabled={m.me || m.pct === 100 || busy === m.userId} onClick={() => void remind(m)} title={m.me ? "Đây là bạn" : m.pct === 100 ? "Đã hoàn thành" : `Gửi thông báo nhắc ${m.name}`}>
                <Icon name="bell" size={14} /> {busy === m.userId ? "Đang gửi…" : "Gửi nhắc"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
