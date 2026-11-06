"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SCOPE_HINT, SCOPE_LABEL, SCOPES, type RoleDef, type Scope } from "@/lib/roles";

type RoleRow = RoleDef & { members: number; invites: number };
type Matrix = { key: string; label: string; actions: { key: string; label: string; hint: string; ownerOnly: boolean; roles: Record<string, boolean> }[] }[];
type View = { roles: RoleRow[]; matrix: Matrix };
type Mod = { key: string; label: string; actions: { key: string; label: string; hint: string; ownerOnly: boolean }[] };
type Draft = { name: string; color: string; base: "manager" | "member"; actions: string[]; scope: Scope; unassigned: boolean };

const COLORS = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#0086c0", "#ff642e", "#9cd326", "#784bd1", "#037f4c"];
const draftOf = (r: RoleDef): Draft => ({ name: r.name, color: r.color, base: r.base === "manager" ? "manager" : "member", actions: [...r.actions], scope: r.scope, unassigned: r.unassigned });
const same = (a: Draft, b: Draft) => JSON.stringify({ ...a, actions: [...a.actions].sort() }) === JSON.stringify({ ...b, actions: [...b.actions].sort() });

export function RolesClient({ initial, modules, canManage, myRole, initialRole, initialTab }: { initial: View; modules: Mod[]; canManage: boolean; myRole: string; initialRole: string; initialTab: "edit" | "compare" }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [tab, setTab] = useState<"edit" | "compare">(initialTab);
  const [sel, setSel] = useState(initial.roles.some((r) => r.key === initialRole) ? initialRole : canManage ? "manager" : myRole);
  const role = view.roles.find((r) => r.key === sel) ?? view.roles[0];
  const [draft, setDraft] = useState<Draft>(draftOf(role));
  const [open, setOpen] = useState<Set<string>>(new Set(modules.map((m) => m.key)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFrom, setNewFrom] = useState("member");
  const [del, setDel] = useState<{ reassignTo: string } | null>(null);

  const editable = canManage && role.key !== "owner";
  const dirty = editable && !same(draft, draftOf(role));
  const isOwnerRole = role.key === "owner";

  function pick(key: string) {
    const r = view.roles.find((x) => x.key === key);
    if (!r) return;
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu?")) return;
    setSel(key);
    setDraft(draftOf(r));
    setMsg(null);
    setDel(null);
  }

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, status: r.status, j };
  }

  async function save() {
    const body = role.builtin ? { actions: draft.actions, scope: draft.scope, unassigned: draft.unassigned } : draft;
    const { ok, j } = await call(`/api/roles/${role.key}`, "PATCH", body);
    if (!ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    setView({ roles: j.roles, matrix: j.matrix });
    setDraft(draftOf(j.role));
    setMsg({ ok: true, text: `Đã lưu vai trò “${j.role.name}”. Thay đổi áp dụng ngay cho ${role.members} thành viên.` });
    router.refresh();
  }

  async function reset() {
    if (!confirm(`Đưa vai trò “${role.name}” về quyền mặc định?`)) return;
    const { ok, j } = await call(`/api/roles/${role.key}`, "PATCH", { reset: true });
    if (!ok) return setMsg({ ok: false, text: j.error ?? "Không đặt lại được" });
    setView({ roles: j.roles, matrix: j.matrix });
    setDraft(draftOf(j.role));
    setMsg({ ok: true, text: "Đã về quyền mặc định" });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { ok, j } = await call("/api/roles", "POST", { name: newName, copyFrom: newFrom, color: COLORS[(view.roles.length + 1) % COLORS.length] });
    if (!ok) return setMsg({ ok: false, text: j.error ?? "Không tạo được vai trò" });
    setView({ roles: j.roles, matrix: j.matrix });
    setCreating(false);
    setNewName("");
    setSel(j.role.key);
    setDraft(draftOf(j.role));
    setTab("edit");
    setMsg({ ok: true, text: `Đã tạo vai trò “${j.role.name}”. Chỉnh quyền bên dưới rồi bấm Lưu.` });
  }

  async function remove() {
    const inUse = role.members + role.invites > 0;
    if (!inUse && !confirm(`Xoá vai trò “${role.name}”?`)) return;
    const { ok, status, j } = await call(`/api/roles/${role.key}`, "DELETE", inUse ? { reassignTo: del?.reassignTo } : {});
    if (status === 409) return setDel({ reassignTo: del?.reassignTo ?? "member" });
    if (!ok) return setMsg({ ok: false, text: j.error ?? "Không xoá được" });
    setView({ roles: j.roles, matrix: j.matrix });
    const next = j.roles.find((r: RoleRow) => r.key === "member") ?? j.roles[0];
    setSel(next.key);
    setDraft(draftOf(next));
    setDel(null);
    setMsg({ ok: true, text: `Đã xoá vai trò “${role.name}”` });
    router.refresh();
  }

  function copyFrom(key: string) {
    const src = view.roles.find((r) => r.key === key);
    if (!src) return;
    setDraft({ ...draft, actions: src.key === "owner" ? modules.flatMap((m) => m.actions.filter((a) => !a.ownerOnly).map((a) => a.key)) : [...src.actions], scope: src.scope, unassigned: src.unassigned });
    setMsg({ ok: true, text: `Đã chép quyền từ “${src.name}”. Bấm Lưu để áp dụng.` });
  }

  const has = (k: string) => isOwnerRole || draft.actions.includes(k);
  const toggle = (k: string) => setDraft({ ...draft, actions: draft.actions.includes(k) ? draft.actions.filter((x) => x !== k) : [...draft.actions, k] });
  const setModule = (m: Mod, on: boolean) => {
    const keys = m.actions.filter((a) => !a.ownerOnly).map((a) => a.key);
    setDraft({ ...draft, actions: on ? [...new Set([...draft.actions, ...keys])] : draft.actions.filter((x) => !keys.includes(x)) });
  };
  const total = useMemo(() => modules.reduce((s, m) => s + m.actions.filter((a) => !a.ownerOnly).length, 0), [modules]);
  const count = isOwnerRole ? total : draft.actions.length;

  return (
    <div className="mt-5">
      <div role="tablist" aria-label="Chế độ xem vai trò" className="flex gap-1 border-b border-line-soft">
        {(
          [
            ["edit", canManage ? "Sửa vai trò" : "Vai trò"],
            ["compare", "So sánh các vai trò"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px h-9 border-b-2 px-3 text-[14px] ${tab === k ? "border-primary text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {l}
          </button>
        ))}
      </div>

      {msg && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      {tab === "compare" ? (
        <Compare view={view} />
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="grid content-start gap-2" aria-label="Danh sách vai trò">
            <ul className="card grid divide-y divide-[var(--line-soft)] overflow-hidden">
              {view.roles.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => pick(r.key)} aria-current={r.key === sel} className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-hover ${r.key === sel ? "bg-primary-selected" : ""}`}>
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: r.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{r.name}</span>
                      <span className="block text-[12px] text-ink-2">
                        {r.builtin ? "Có sẵn" : "Tự tạo"} · {r.members} người{r.invites ? ` · ${r.invites} link mời` : ""}
                      </span>
                    </span>
                    {r.key === myRole && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">Bạn</span>}
                  </button>
                </li>
              ))}
            </ul>
            {canManage &&
              (creating ? (
                <form onSubmit={create} className="card grid gap-2 p-3">
                  <label className="grid gap-1">
                    <span className="label">Tên vai trò</span>
                    <input className="input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Kế toán, CSKH…" />
                  </label>
                  <label className="grid gap-1">
                    <span className="label">Sao chép quyền từ</span>
                    <select className="input" value={newFrom} onChange={(e) => setNewFrom(e.target.value)}>
                      {view.roles
                        .filter((r) => r.key !== "owner")
                        .map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary flex-1 justify-center" disabled={busy || !newName.trim()}>
                      Tạo
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>
                      Huỷ
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn-outline justify-center" onClick={() => setCreating(true)}>
                  <Icon name="plus" size={15} /> Tạo vai trò
                </button>
              ))}
            {!canManage && <p className="text-[12.5px] text-ink-2">Chỉ chủ workspace tạo và sửa được vai trò.</p>}
          </aside>

          <section className="card min-w-0 p-4 sm:p-5" aria-label={`Quyền của vai trò ${role.name}`}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                {editable && !role.builtin ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input h-9 w-56 text-[16px] font-semibold" aria-label="Tên vai trò" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    <span className="flex gap-1" role="radiogroup" aria-label="Màu vai trò">
                      {COLORS.map((c) => (
                        <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={`Màu ${c}`} onClick={() => setDraft({ ...draft, color: c })} className={`h-5 w-5 rounded-full ${draft.color === c ? "ring-2 ring-offset-2 ring-[var(--ink)]" : ""}`} style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                ) : (
                  <h2 className="flex items-center gap-2 text-[18px] font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: role.color }} /> {role.name}
                  </h2>
                )}
                <p className="mt-1 text-[13px] text-ink-2">
                  {isOwnerRole ? "Chủ luôn có toàn quyền và thấy toàn bộ dữ liệu. Không sửa được." : `${count}/${total} quyền · Phạm vi: ${SCOPE_LABEL[draft.scope]}`}
                </p>
              </div>
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input h-9 w-auto" aria-label="Sao chép từ vai trò" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)}>
                    <option value="">Sao chép từ vai trò…</option>
                    {view.roles
                      .filter((r) => r.key !== role.key)
                      .map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                  {role.builtin && (
                    <button type="button" className="btn-ghost" onClick={reset} disabled={busy}>
                      <Icon name="refresh" size={15} /> Mặc định
                    </button>
                  )}
                  <button type="button" className="btn-primary" onClick={save} disabled={busy || !dirty || !draft.name.trim()}>
                    <Icon name="check" size={15} /> Lưu
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-line-soft p-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="label">Phạm vi dữ liệu</span>
                <select className="input" disabled={!editable} value={isOwnerRole ? "all" : draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as Scope })}>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </select>
                <span className="text-[12.5px] text-ink-2">{SCOPE_HINT[isOwnerRole ? "all" : draft.scope]} Áp dụng cho khách, giao dịch, việc, phiếu hỗ trợ, chứng từ, cuộc gọi, tìm kiếm, xuất Excel và trợ lý AI.</span>
              </label>
              <div className="grid content-start gap-2">
                {draft.scope !== "all" && !isOwnerRole && (
                  <label className="flex items-start gap-2 text-[13.5px]">
                    <input type="checkbox" className="mt-0.5" disabled={!editable} checked={draft.unassigned} onChange={(e) => setDraft({ ...draft, unassigned: e.target.checked })} />
                    <span>
                      Thấy cả mục chưa ai phụ trách
                      <span className="block text-[12.5px] text-ink-2">Để nhận khách mới vào. Tắt nếu chỉ được làm việc với khách đã giao.</span>
                    </span>
                  </label>
                )}
                {editable && !role.builtin && (
                  <label className="grid gap-1">
                    <span className="label">Quyền theo trường & che SĐT theo</span>
                    <select className="input" value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value as "manager" | "member" })}>
                      <option value="member">Nhân viên</option>
                      <option value="manager">Quản lý</option>
                    </select>
                    <span className="text-[12.5px] text-ink-2">Vai trò này dùng luật “Quyền & bố cục trường” và “Bảo mật dữ liệu” của vai trò gốc đã chọn.</span>
                  </label>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {modules.map((m) => {
                const grant = m.actions.filter((a) => !a.ownerOnly);
                const on = grant.filter((a) => has(a.key)).length;
                const isOpen = open.has(m.key);
                return (
                  <div key={m.key} className="rounded-lg border border-line-soft">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen((s) => (s.has(m.key) ? new Set([...s].filter((x) => x !== m.key)) : new Set([...s, m.key])))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <Icon name="chevron" size={14} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                        <span className="font-semibold">{m.label}</span>
                        <span className="text-[12.5px] text-ink-2 tnum">
                          {on}/{grant.length}
                        </span>
                      </button>
                      {editable && (
                        <span className="flex gap-1 text-[12.5px]">
                          <button type="button" className="btn-ghost h-7 px-2 text-[12.5px]" onClick={() => setModule(m, true)}>
                            Chọn hết
                          </button>
                          <button type="button" className="btn-ghost h-7 px-2 text-[12.5px]" onClick={() => setModule(m, false)}>
                            Bỏ hết
                          </button>
                        </span>
                      )}
                    </div>
                    {isOpen && (
                      <ul className="grid border-t border-line-soft sm:grid-cols-2">
                        {m.actions.map((a) => {
                          const locked = a.ownerOnly || !editable;
                          const checked = a.ownerOnly ? isOwnerRole : has(a.key);
                          return (
                            <li key={a.key} className="border-line-soft px-3 py-2 sm:odd:border-r">
                              <label className={`flex items-start gap-2.5 ${locked ? "" : "cursor-pointer"}`}>
                                <input type="checkbox" className="mt-1" checked={checked} disabled={locked} onChange={() => toggle(a.key)} aria-describedby={`h-${a.key}`} />
                                <span className="min-w-0">
                                  <span className="text-[14px]">
                                    {a.label}
                                    {a.ownerOnly && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">Chỉ chủ</span>}
                                  </span>
                                  <span id={`h-${a.key}`} className="block text-[12.5px] leading-snug text-ink-2">
                                    {a.hint}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {editable && !role.builtin && (
              <div className="mt-5 border-t border-line-soft pt-4">
                {del ? (
                  <div className="grid gap-2 rounded-lg bg-warning-soft p-3 text-[13.5px]">
                    <p>
                      “{role.name}” đang được {role.members} thành viên{role.invites ? ` và ${role.invites} link mời` : ""} dùng. Chuyển họ sang vai trò:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="input h-9 w-auto" aria-label="Chuyển sang vai trò" value={del.reassignTo} onChange={(e) => setDel({ reassignTo: e.target.value })}>
                        {view.roles
                          .filter((r) => r.key !== role.key && r.key !== "owner")
                          .map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                      <button type="button" className="btn h-9 bg-[#df2f4a] text-white" onClick={remove} disabled={busy}>
                        Chuyển & xoá vai trò
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setDel(null)}>
                        Huỷ
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => (role.members + role.invites > 0 ? setDel({ reassignTo: "member" }) : remove())} disabled={busy}>
                    <Icon name="trash" size={15} /> Xoá vai trò
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Bảng so sánh mọi vai trò cạnh nhau (chỉ đọc). */
function Compare({ view }: { view: View }) {
  return (
    <div className="card mt-4 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead className="sticky top-0 bg-surface-2 text-left text-[12.5px] text-ink-2">
          <tr>
            <th className="px-3 py-2 font-medium">Quyền</th>
            {view.roles.map((r) => (
              <th key={r.key} className="w-28 px-2 py-2 text-center font-medium" style={{ color: r.color }}>
                {r.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line-soft">
            <td className="px-3 py-2 font-medium">Phạm vi dữ liệu</td>
            {view.roles.map((r) => (
              <td key={r.key} className="px-2 py-2 text-center text-[12.5px]">
                {SCOPE_LABEL[r.scope]}
                {r.scope !== "all" && r.unassigned ? <span className="block text-ink-2">+ chưa giao</span> : null}
              </td>
            ))}
          </tr>
          {view.matrix.map((m) => (
            <MatrixGroup key={m.key} group={m} roles={view.roles} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixGroup({ group, roles }: { group: Matrix[number]; roles: RoleRow[] }) {
  return (
    <>
      <tr className="border-t border-line-soft bg-surface-2/60">
        <th colSpan={roles.length + 1} className="px-3 py-1.5 text-left text-[12.5px] font-semibold uppercase tracking-wide text-ink-2">
          {group.label}
        </th>
      </tr>
      {group.actions.map((a) => (
        <tr key={a.key} className="border-t border-line-soft">
          <td className="px-3 py-2" title={a.hint}>
            {a.label}
            {a.ownerOnly && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">Chỉ chủ</span>}
          </td>
          {roles.map((r) => (
            <td key={r.key} className={`text-center ${a.roles[r.key] ? "text-success" : "text-ink-2"}`} aria-label={a.roles[r.key] ? "Có" : "Không"}>
              {a.roles[r.key] ? "✓" : "–"}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
