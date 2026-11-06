"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { Drawer, EmptyState } from "@/components/ui";
import type { TicketRouting } from "@/lib/perf/shared";
import type { TeamDTO } from "@/lib/perf/teams";

const COLORS = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#0086c0", "#ff642e", "#9cd326"];
type Form = { id?: string; name: string; leader: string; members: string[]; color: string };

export function TeamsClient({ initialTeams, people, initialRouting }: { initialTeams: TeamDTO[]; people: string[]; initialRouting: TicketRouting }) {
  const [teams, setTeams] = useState(initialTeams);
  const [form, setForm] = useState<Form | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const allPeople = [...new Set([...people, ...teams.flatMap((t) => [t.leader, ...t.members]).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "vi"));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) return setErr("Nhập tên đội");
    setBusy(true);
    setErr("");
    const body = { name: form.name, leader: form.leader, members: form.members.filter((m) => m !== form.leader), color: form.color };
    const r = await fetch(form.id ? `/api/teams/${form.id}` : "/api/teams", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Không lưu được");
    setTeams((l) => (form.id ? l.map((t) => (t.id === j.id ? j : t)) : [...l, j]).sort((a, b) => a.name.localeCompare(b.name, "vi")));
    setForm(null);
  }

  async function remove(t: TeamDTO) {
    if (!confirm(`Xoá đội “${t.name}”? Phiếu hỗ trợ của đội sẽ bỏ gắn đội, chỉ tiêu KPI riêng của đội bị xoá.`)) return;
    const r = await fetch(`/api/teams/${t.id}`, { method: "DELETE" });
    if (r.ok) setTeams((l) => l.filter((x) => x.id !== t.id));
  }

  const toggle = (name: string) => form && setForm({ ...form, members: form.members.includes(name) ? form.members.filter((m) => m !== name) : [...form.members, name] });

  return (
    <>
      <section className="mt-6" aria-label="Danh sách đội">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="section-title">Các đội</h2>
          <button type="button" className="btn-primary" onClick={() => { setErr(""); setForm({ name: "", leader: "", members: [], color: COLORS[teams.length % COLORS.length] }); }}>
            <Icon name="plus" size={15} /> Thêm đội
          </button>
        </div>
        {teams.length === 0 ? (
          <div className="card">
            <EmptyState icon="users" title="Chưa có đội nào" desc="Tạo đội Kinh doanh, Chăm sóc khách hàng… rồi chọn thành viên và trưởng nhóm." />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-3 w-3 flex-none rounded-full" style={{ background: t.color }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold">{t.name}</h3>
                    <p className="text-[12.5px] text-ink-2">
                      {t.members.length + (t.leader ? 1 : 0)} người{t.leader ? ` · trưởng nhóm ${t.leader}` : " · chưa có trưởng nhóm"}
                    </p>
                  </div>
                  <button type="button" className="btn-ghost h-8 px-2" aria-label={`Sửa đội ${t.name}`} onClick={() => { setErr(""); setForm({ ...t }); }}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button type="button" className="btn-ghost h-8 px-2" aria-label={`Xoá đội ${t.name}`} onClick={() => remove(t)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[t.leader, ...t.members].filter(Boolean).map((m) => (
                    <span key={m} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2 text-[12.5px]">
                      <Avatar name={m} size={20} /> {m}
                      {m === t.leader && <Icon name="award" size={12} className="text-warning" />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Routing teams={teams} initial={initialRouting} />

      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.id ? "Sửa đội" : "Đội mới"} width={460}>
        {form && (
          <form onSubmit={save} className="grid gap-4">
            <label className="grid gap-1">
              <span className="label">Tên đội</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Kinh doanh" autoFocus />
            </label>
            <div className="grid gap-1">
              <span className="label">Màu</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Màu ${c}`} aria-pressed={form.color === c} onClick={() => setForm({ ...form, color: c })} className={`h-7 w-7 rounded-full ${form.color === c ? "ring-2 ring-ink ring-offset-2" : ""}`} style={{ background: c }} />
                ))}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="label">Trưởng nhóm</span>
              <select className="input" value={form.leader} onChange={(e) => setForm({ ...form, leader: e.target.value, members: form.members.filter((m) => m !== e.target.value) })}>
                <option value="">Chưa chọn</option>
                {allPeople.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-1">
              <legend className="label mb-1">Thành viên</legend>
              <div className="grid max-h-[280px] gap-1 overflow-y-auto rounded-lg border border-line-soft p-2">
                {allPeople.filter((p) => p !== form.leader).map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded px-1 py-1 text-[13.5px] hover:bg-[var(--row-hover)]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={form.members.includes(p)} onChange={() => toggle(p)} />
                    <Avatar name={p} size={22} /> {p}
                  </label>
                ))}
                {form.members.filter((m) => !allPeople.includes(m)).map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded px-1 py-1 text-[13.5px]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked onChange={() => toggle(p)} />
                    <Avatar name={p} size={22} /> {p}
                  </label>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                <input className="input h-8 flex-1" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Thêm người chưa có trong danh sách" aria-label="Tên người cần thêm" />
                <button type="button" className="btn-outline h-8" onClick={() => { const n = extra.trim(); if (n && !form.members.includes(n) && n !== form.leader) setForm({ ...form, members: [...form.members, n] }); setExtra(""); }}>
                  Thêm
                </button>
              </div>
              <p className="text-[12px] text-ink-2">Danh sách gồm tài khoản thành viên và tên người phụ trách đang dùng trong khách, giao dịch, phiếu hỗ trợ.</p>
            </fieldset>
            {err && <p className="text-[13px] text-danger">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>
                Huỷ
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu đội"}
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </>
  );
}

function Routing({ teams, initial }: { teams: TeamDTO[]; initial: TicketRouting }) {
  const [cats, setCats] = useState(initial.categories);
  const [rules, setRules] = useState<Record<string, string>>(Object.fromEntries(initial.rules.map((r) => [r.category, r.teamId])));
  const [def, setDef] = useState(initial.defaultTeamId);
  const [auto, setAuto] = useState(initial.autoAssign);
  const [newCat, setNewCat] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMsg(null);
    const body = { categories: cats, rules: cats.filter((c) => rules[c]).map((c) => ({ category: c, teamId: rules[c] })), defaultTeamId: def, autoAssign: auto };
    const r = await fetch("/api/teams/routing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Đã lưu phân luồng phiếu hỗ trợ." } : { ok: false, text: j.error ?? "Không lưu được" });
  }

  function addCat() {
    const c = newCat.trim();
    if (c && !cats.includes(c)) setCats([...cats, c]);
    setNewCat("");
  }

  return (
    <section className="mt-8" aria-label="Phân luồng phiếu hỗ trợ">
      <h2 className="section-title mb-1">Phân luồng phiếu hỗ trợ</h2>
      <p className="mb-3 text-[13px] text-ink-2">Mỗi phân loại phiếu chuyển về một đội. Phiếu mới chưa giao ai sẽ được giao xoay vòng lần lượt cho từng người trong đội.</p>
      <div className="card grid gap-3 p-4">
        {teams.length === 0 && <p className="text-[13px] text-warning">Tạo ít nhất một đội để phân luồng.</p>}
        <div className="grid gap-2">
          {cats.map((c) => (
            <div key={c} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[180px] flex-1 text-[13.5px] font-medium">{c}</span>
              <span className="text-ink-2">→</span>
              <select className="input h-8 w-[220px]" aria-label={`Đội nhận phiếu “${c}”`} value={rules[c] ?? ""} onChange={(e) => setRules({ ...rules, [c]: e.target.value })}>
                <option value="">Theo đội mặc định</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost h-8 px-2" aria-label={`Xoá phân loại ${c}`} onClick={() => setCats(cats.filter((x) => x !== c))}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <input className="input h-8 min-w-[200px] flex-1" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCat())} placeholder="Phân loại mới, ví dụ: Đổi trả" aria-label="Phân loại mới" />
            <button type="button" className="btn-outline h-8" onClick={addCat}>
              <Icon name="plus" size={14} /> Thêm phân loại
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft pt-3">
          <label className="flex items-center gap-2 text-[13.5px]">
            Đội mặc định (phiếu không phân loại / chưa có luật)
            <select className="input h-8 w-[200px]" value={def} onChange={(e) => setDef(e.target.value)}>
              <option value="">Không chuyển đội</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Tự giao xoay vòng trong đội
          </label>
          <span className="flex-1" />
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu phân luồng"}
          </button>
        </div>
        {msg && <p role="status" className={`text-[13px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}
