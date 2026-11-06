"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/components/ui";
import { MODE_INFO, METHOD_INFO, type AssignGroup, type AssignMethod, type AssignMode, type InboxAssignPref } from "@/lib/chat/assign-shared";
import { DAY_LABEL } from "@/lib/chat/hours";
import type { TeamDTO } from "@/lib/perf/teams";

type Presence = { userId: string; name: string; at: string | null; online: boolean };

const MODES: AssignMode[] = ["off", "self", "auto"];
const METHODS: AssignMethod[] = ["round_robin", "online_first", "online_only", "least_open"];
const MODE_ICON: Record<AssignMode, string> = { off: "x", self: "person", auto: "refresh" };

const newId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function ago(iso: string | null) {
  if (!iso) return "chưa thấy";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

/** Chọn nhiều người dạng chip. */
function PeoplePicker({ all, value, onChange, label }: { all: string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {all.map((n) => (
        <button key={n} type="button" aria-pressed={value.includes(n)} onClick={() => toggle(n)} className={`chip !h-7 gap-1.5 !px-2 ${value.includes(n) ? "chip-on" : ""}`}>
          <Avatar name={n} size={18} />
          {n}
          {value.includes(n) && <Icon name="check" size={13} />}
        </button>
      ))}
      {!all.length && <p className="text-[13px] text-ink-2">Chưa có nhân viên nào có tài khoản.</p>}
    </div>
  );
}

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-hover">
      <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-[13px] text-ink-2">{desc}</span>
      </span>
    </label>
  );
}

export function InboxSettingsClient({ initial, staff, teams, initialPresence }: { initial: InboxAssignPref; staff: string[]; teams: TeamDTO[]; initialPresence: Presence[] }) {
  const [p, setP] = useState<InboxAssignPref>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [presence, setPresence] = useState(initialPresence);
  const dirty = JSON.stringify(p) !== saved;
  // Chỉ người có tài khoản mới nhận được hội thoại; giữ thêm tên đang có trong cấu hình để không mất khi đổi tên.
  const pool = useMemo(() => [...new Set([...staff, ...p.groups.flatMap((g) => g.members), ...p.perChannel.inbox, ...p.perChannel.comment])].sort((a, b) => a.localeCompare(b, "vi")), [staff, p]);
  const notStaff = new Set(pool.filter((n) => !staff.includes(n)));

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/inbox/presence").catch(() => null);
      if (r?.ok && alive) setPresence(((await r.json()) as { people: Presence[] }).people);
    };
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof InboxAssignPref>(k: K, v: InboxAssignPref[K]) => setP((x) => ({ ...x, [k]: v }));
  const setGroup = (id: string, patch: Partial<AssignGroup>) => set("groups", p.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const totalRatio = p.groups.reduce((s, g) => s + (g.members.length ? g.ratio : 0), 0);

  function importTeam(teamId: string) {
    const t = teams.find((x) => x.id === teamId);
    if (!t) return;
    const members = [...new Set([t.leader, ...t.members].filter((n) => n && staff.includes(n)))];
    const exist = p.groups.find((g) => g.teamId === t.id);
    if (exist) setGroup(exist.id, { members, name: t.name });
    else set("groups", [...p.groups, { id: newId(), name: t.name, teamId: t.id, members, ratio: 1 }]);
    if (!members.length) toast(`Đội “${t.name}” chưa có thành viên nào có tài khoản`, "error");
  }

  function setDay(day: number, patch: { on?: boolean; start?: string; end?: string }) {
    const cur = p.workingHours.days.find((d) => d.day === day);
    let days = p.workingHours.days.filter((d) => d.day !== day);
    if (patch.on === false) {
      /* bỏ ngày */
    } else if (patch.on === true || cur) days = [...days, { day, start: patch.start ?? cur?.start ?? "08:00", end: patch.end ?? cur?.end ?? "21:00" }];
    set("workingHours", { ...p.workingHours, days: days.sort((a, b) => a.day - b.day) });
  }

  async function save() {
    for (const d of p.workingHours.days) if (d.end <= d.start) return toast(`${DAY_LABEL[d.day]}: giờ kết thúc phải sau giờ bắt đầu`, "error");
    setBusy(true);
    const r = await fetch("/api/inbox/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(j.error ?? "Không lưu được", "error");
    setP(j.pref);
    setSaved(JSON.stringify(j.pref));
    toast("Đã lưu cài đặt hộp thư");
  }

  const online = presence.filter((x) => x.online);
  const offline = presence.filter((x) => !x.online);

  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid min-w-0 content-start gap-5">
        {/* ───── Chia hội thoại ───── */}
        <section className="card p-4 sm:p-5" aria-labelledby="sec-assign">
          <h2 id="sec-assign" className="section-title">
            Chia hội thoại
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">Khi khách nhắn tin hoặc bình luận mới, ai sẽ là người phụ trách?</p>
          <div role="radiogroup" aria-label="Chế độ chia hội thoại" className="mt-3 grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={p.mode === m} onClick={() => set("mode", m)} className={`rounded-lg border p-3 text-left transition-colors ${p.mode === m ? "border-primary bg-primary-selected" : "border-line hover:bg-hover"}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <Icon name={MODE_ICON[m]} size={16} /> {MODE_INFO[m].title}
                </span>
                <span className="mt-1 block text-[13px] text-ink-2">{MODE_INFO[m].desc}</span>
              </button>
            ))}
          </div>

          {p.mode !== "off" && (
            <div className="mt-4 grid gap-1">
              <Toggle checked={p.keepPrevious} onChange={(v) => set("keepPrevious", v)} title="Khách cũ quay lại → giao lại người đã chăm" desc="Khách từng nói chuyện với ai thì hội thoại mới về lại người đó (nếu họ vẫn nhận được loại hội thoại này)." />
            </div>
          )}

          {p.mode === "auto" && (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Nhóm nhận hội thoại</h3>
                <div className="flex flex-wrap gap-2">
                  {teams.length > 0 && (
                    <select className="input !h-8 !w-auto text-[13px]" value="" onChange={(e) => importTeam(e.target.value)} aria-label="Lấy nhóm từ đội">
                      <option value="">Lấy từ đội…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button type="button" className="btn-outline !h-8" onClick={() => set("groups", [...p.groups, { id: newId(), name: `Nhóm ${p.groups.length + 1}`, members: [], ratio: 1 }])}>
                    <Icon name="plus" size={14} /> Thêm nhóm
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">
                {p.groups.length
                  ? "Hội thoại chia giữa các nhóm theo tỉ lệ, trong nhóm chia lần lượt từng người. Ví dụ tỉ lệ 2 : 1 → cứ 3 hội thoại thì nhóm đầu nhận 2."
                  : "Chưa có nhóm: hội thoại chia lần lượt cho mọi nhân viên có tài khoản (hoặc người được chọn nhận ở mục bên dưới)."}
              </p>
              <div className="mt-3 grid gap-3">
                {p.groups.map((g) => (
                  <div key={g.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid min-w-[10rem] flex-1 gap-1">
                        <span className="label">Tên nhóm</span>
                        <input className="input" value={g.name} maxLength={80} onChange={(e) => setGroup(g.id, { name: e.target.value })} />
                      </label>
                      <label className="grid w-24 gap-1">
                        <span className="label">Tỉ lệ</span>
                        <input className="input tnum" type="number" min={0} max={100} value={g.ratio} onChange={(e) => setGroup(g.id, { ratio: Math.max(0, Math.min(100, Math.round(+e.target.value || 0))) })} />
                      </label>
                      <span className="pb-2 text-[13px] text-ink-2 tnum">{totalRatio && g.members.length ? `≈ ${Math.round((g.ratio / totalRatio) * 100)}%` : "—"}</span>
                      <button type="button" className="btn-ghost h-9 px-2" aria-label={`Xoá nhóm ${g.name}`} onClick={() => set("groups", p.groups.filter((x) => x.id !== g.id))}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    <div className="mt-3">
                      <PeoplePicker all={pool} value={g.members} onChange={(members) => setGroup(g.id, { members })} label={`Thành viên nhóm ${g.name}`} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Ai nhận tin nhắn</h3>
                  <p className="mb-2 text-[13px] text-ink-2">Không chọn ai = mọi người trong nhóm.</p>
                  <PeoplePicker all={pool} value={p.perChannel.inbox} onChange={(v) => set("perChannel", { ...p.perChannel, inbox: v })} label="Người nhận hội thoại tin nhắn" />
                </div>
                <div>
                  <h3 className="font-semibold">Ai nhận bình luận</h3>
                  <p className="mb-2 text-[13px] text-ink-2">Không chọn ai = mọi người trong nhóm.</p>
                  <PeoplePicker all={pool} value={p.perChannel.comment} onChange={(v) => set("perChannel", { ...p.perChannel, comment: v })} label="Người nhận hội thoại bình luận" />
                </div>
              </div>

              <div className="mt-5">
                <h3 className="font-semibold">Cách chia</h3>
                <div role="radiogroup" aria-label="Cách chia" className="mt-2 grid gap-2 sm:grid-cols-2">
                  {METHODS.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={p.method === m} onClick={() => set("method", m)} className={`rounded-lg border p-3 text-left ${p.method === m ? "border-primary bg-primary-selected" : "border-line hover:bg-hover"}`}>
                      <span className="block font-medium">{METHOD_INFO[m].title}</span>
                      <span className="block text-[13px] text-ink-2">{METHOD_INFO[m].desc}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12.5px] text-ink-2">“Đang trực” = đang mở trang Hộp thư (cập nhật mỗi phút, quá 3 phút không thấy coi như ngoại tuyến).</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="label">Chia lại khi khách chờ quá (phút)</span>
                  <input className="input tnum" type="number" min={0} max={1440} value={p.reassignAfterMin} onChange={(e) => set("reassignAfterMin", Math.max(0, Math.min(1440, Math.round(+e.target.value || 0))))} />
                  <span className="text-[12.5px] text-ink-2">{p.reassignAfterMin ? `Khách chờ ${p.reassignAfterMin} phút mà người phụ trách ngoại tuyến → chuyển cho người đang trực.` : "0 = không chia lại."}</span>
                </label>
                <div className="grid content-start gap-1">
                  <Toggle checked={p.offHoursAssign} onChange={(v) => set("offHoursAssign", v)} title="Ngoài giờ vẫn chia ngay" desc="Tắt: tin đến ngoài giờ làm việc để chờ, đầu ca mới chia cho người trực." />
                </div>
              </div>
            </>
          )}
        </section>

        {/* ───── Giờ làm việc ───── */}
        <section className="card p-4 sm:p-5" aria-labelledby="sec-hours">
          <h2 id="sec-hours" className="section-title">
            Giờ làm việc
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">Thời gian phản hồi trong thống kê và điểm chất lượng chỉ tính trong giờ làm việc. Múi giờ: {p.workingHours.tz}.</p>
          <div className="mt-3 grid gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => {
              const d = p.workingHours.days.find((x) => x.day === day);
              return (
                <div key={day} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <label className="flex w-32 items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={!!d} onChange={(e) => setDay(day, { on: e.target.checked })} />
                    <span className="font-medium">{DAY_LABEL[day]}</span>
                  </label>
                  {d ? (
                    <div className="flex items-center gap-2">
                      <input type="time" className="input !w-28 tnum" aria-label={`${DAY_LABEL[day]} bắt đầu`} value={d.start} onChange={(e) => setDay(day, { start: e.target.value })} />
                      <span className="text-ink-2">–</span>
                      <input type="time" className="input !w-28 tnum" aria-label={`${DAY_LABEL[day]} kết thúc`} value={d.end === "24:00" ? "23:59" : d.end} onChange={(e) => setDay(day, { end: e.target.value })} />
                    </div>
                  ) : (
                    <span className="text-[13px] text-ink-2">Nghỉ</span>
                  )}
                </div>
              );
            })}
          </div>
          {!p.workingHours.days.length && <p className="mt-2 text-[13px] text-ink-2">Không chọn ngày nào = tính cả ngày, mọi ngày.</p>}
        </section>

        {/* ───── Quyền xem ───── */}
        <section className="card p-4 sm:p-5" aria-labelledby="sec-view">
          <h2 id="sec-view" className="section-title">
            Quyền xem
          </h2>
          <div className="mt-2 grid gap-1">
            <Toggle checked={p.membersSeeOnlyMine} onChange={(v) => set("membersSeeOnlyMine", v)} title="Nhân viên chỉ thấy hội thoại của mình" desc="Người không có quyền “Xem mọi hội thoại” chỉ thấy hội thoại giao cho mình và hội thoại chưa giao ai. Chủ và quản lý vẫn thấy hết." />
            <Toggle checked={p.autoAssignFirstReplier} onChange={(v) => set("autoAssignFirstReplier", v)} title="Người trả lời đầu tiên nhận hội thoại" desc="Hội thoại chưa có người phụ trách: ai trả lời khách trước sẽ thành người phụ trách." />
          </div>
        </section>
      </div>

      {/* ───── Ai đang trực tuyến ───── */}
      <aside className="card h-fit p-4 xl:sticky xl:top-4" aria-labelledby="sec-online">
        <h2 id="sec-online" className="section-title flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#00c875]" aria-hidden="true" /> Ai đang trực tuyến
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-2">Người đang mở Hộp thư. Tự cập nhật mỗi 30 giây.</p>
        <ul className="mt-3 grid gap-2">
          {online.map((x) => (
            <li key={x.userId} className="flex items-center gap-2">
              <Avatar name={x.name} size={26} />
              <span className="min-w-0 flex-1 truncate font-medium">{x.name}</span>
              <span className="badge-success">Trực tuyến</span>
            </li>
          ))}
          {!online.length && <li className="text-[13px] text-ink-2">Chưa ai đang trực.</li>}
        </ul>
        {offline.length > 0 && (
          <>
            <h3 className="label mt-4">Ngoại tuyến</h3>
            <ul className="mt-2 grid gap-2">
              {offline.slice(0, 12).map((x) => (
                <li key={x.userId} className="flex items-center gap-2 text-ink-2">
                  <Avatar name={x.name} size={22} />
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  <span className="text-[12px]">{ago(x.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {notStaff.size > 0 && <p className="mt-4 text-[12.5px] text-[#d83a52]">Không có tài khoản nên không nhận được hội thoại: {[...notStaff].join(", ")}.</p>}
      </aside>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 py-3 sm:-mx-8 sm:px-8 xl:col-span-2" role="region" aria-label="Lưu cài đặt">
        {/* Nút ở bên trái để không bị nút "Trợ lý AI" nổi góc phải che. */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={!dirty || busy} onClick={save}>
            {busy ? "Đang lưu…" : "Lưu cài đặt"}
          </button>
          <button type="button" className="btn-outline" disabled={!dirty || busy} onClick={() => setP(JSON.parse(saved))}>
            Hoàn tác
          </button>
          <span className="text-[13px] text-ink-2">{dirty ? "Có thay đổi chưa lưu" : "Đã lưu"}</span>
        </div>
      </div>
    </div>
  );
}
