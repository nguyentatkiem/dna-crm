"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

type Role = "owner" | "manager" | "member";
type M = { id: string; name: string; email: string; role: Role; inTeam: boolean };
type Perm = { action: string; label: string; owner: boolean; manager: boolean; member: boolean };
type Data = {
  me: string;
  myRole: Role;
  isOwner: boolean;
  canManageSettings: boolean;
  roles: { key: Role; label: string }[];
  permissions: Perm[];
  memberSeesOwnOnly: boolean;
  team: string[];
  members: M[];
  invites: { token: string; role: Role; expiresAt: string }[];
};

const ROLE_COLOR: Record<Role, string> = { owner: "#a25ddc", manager: "#0086c0", member: "#579bfc" };

export function Members() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [link, setLink] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [msg, setMsg] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/members");
    if (r.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    return { ok: r.ok, j };
  }

  async function invite() {
    const { ok, j } = await call("/api/members", "POST", { role: inviteRole });
    if (ok) {
      setLink(j.url);
      load();
    } else setMsg(j.error);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMsg("Đã sao chép link mời");
    } catch {
      setMsg("Hãy bôi đen link và sao chép thủ công");
    }
  }
  async function reset(id: string) {
    const { ok, j } = await call(`/api/members/${id}`, "PATCH", { password: pw });
    setMsg(ok ? "Đã đặt lại mật khẩu. Hãy gửi mật khẩu mới cho thành viên." : j.error);
    if (ok) {
      setResetFor(null);
      setPw("");
    }
  }
  async function remove(id: string) {
    const { ok, j } = await call(`/api/members/${id}`, "DELETE");
    setRemoveFor(null);
    if (ok) load();
    else setMsg(j.error);
  }
  async function changeRole(m: M, role: Role) {
    const { ok, j } = await call(`/api/members/${m.id}`, "PATCH", { role });
    setMsg(ok ? `Đã đổi vai trò của ${m.name}` : j.error);
    load();
    if (ok && m.id === d?.me) router.refresh();
  }
  async function addToTeam(m: M) {
    const { ok, j } = await call("/api/members/team", "POST", { userId: m.id });
    setMsg(ok ? `Đã thêm ${m.name} vào đội. Giờ có thể giao khách và việc cho ${m.name}.` : j.error);
    if (ok) {
      load();
      router.refresh();
    }
  }
  async function toggleOwnOnly() {
    if (!d) return;
    const next = !d.memberSeesOwnOnly;
    setD({ ...d, memberSeesOwnOnly: next });
    const { ok, j } = await call("/api/members/permissions", "POST", { memberSeesOwnOnly: next });
    if (!ok) {
      setD({ ...d, memberSeesOwnOnly: !next });
      setMsg(j.error);
    }
  }

  if (!d) return <section className="card mt-4 p-5 text-ink-2">Đang tải thành viên...</section>;
  const roleLabel = (r: Role) => d.roles.find((x) => x.key === r)?.label ?? r;
  const missing = d.members.filter((m) => !m.inTeam);

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Thành viên & phân quyền</h2>
          <p className="mt-1 text-[14px] text-ink-2">Mời nhân viên bằng link dùng một lần, hết hạn sau 7 ngày. Vai trò của bạn: {roleLabel(d.myRole)}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.myRole !== "member" && (
            <Link href="/w/settings/audit" className="btn-outline">
              <Icon name="history" size={16} /> Nhật ký thao tác
            </Link>
          )}
          {d.isOwner && (
            <>
              <select id="invite-role" aria-label="Vai trò người được mời" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="input h-9 w-auto">
                <option value="member">Mời làm Nhân viên</option>
                <option value="manager">Mời làm Quản lý</option>
              </select>
              <button type="button" className="btn-primary" onClick={invite} disabled={busy}>
                <Icon name="link" size={16} /> Tạo link mời
              </button>
            </>
          )}
        </div>
      </div>
      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-surface-2 p-2.5">
          <code className="min-w-0 flex-1 break-all text-[12.5px]">{link}</code>
          <button type="button" className="btn-outline h-7 text-[13px]" onClick={copy}>
            Sao chép
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[13px] text-ink-2" role="status">{msg}</p>}

      {d.isOwner && missing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-line-soft bg-warning-soft p-3 text-[13.5px]">
          <Icon name="users" size={16} className="text-warning" />
          <span className="min-w-0 flex-1">
            {missing.map((m) => m.name).join(", ")} chưa có trong danh sách đội nên chưa giao khách, giao việc được.
          </span>
        </div>
      )}

      <ul className="mt-3 grid divide-y divide-[var(--line-soft)]">
        {d.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar name={m.name} size={32} />
            <span className="min-w-0 flex-1">
              <b className="text-[14px]">{m.name}</b>
              {m.id === d.me && <span className="text-[12px] text-ink-2"> (bạn)</span>}
              <span className="block truncate text-[12.5px] text-ink-2">{m.email}</span>
            </span>
            {d.isOwner && !m.inTeam && (
              <button type="button" className="btn-outline h-8 text-[13px]" onClick={() => addToTeam(m)} disabled={busy}>
                <Icon name="plus" size={14} /> Thêm vào đội
              </button>
            )}
            {d.isOwner ? (
              <select
                id={`role-${m.id}`}
                aria-label={`Vai trò của ${m.name}`}
                value={m.role}
                disabled={busy}
                onChange={(e) => changeRole(m, e.target.value as Role)}
                className="h-8 rounded border border-line bg-surface px-2 text-[13px] font-semibold"
                style={{ color: ROLE_COLOR[m.role] }}
              >
                {d.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded px-2 py-0.5 text-[12px] text-white" style={{ background: ROLE_COLOR[m.role] }}>
                {roleLabel(m.role)}
              </span>
            )}
            {d.isOwner &&
              (resetFor === m.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <input id={`pw-${m.id}`} type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mật khẩu mới" className="input h-8 w-40" />
                  <button type="button" className="btn-primary h-8 text-[13px]" disabled={pw.length < 8 || busy} onClick={() => reset(m.id)}>Lưu</button>
                  <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setResetFor(null)}>Huỷ</button>
                </span>
              ) : removeFor === m.id ? (
                <span className="flex items-center gap-2 text-[13px]">
                  Xoá khỏi workspace?
                  <button type="button" className="btn h-8 bg-[#df2f4a] text-[13px] text-white" onClick={() => remove(m.id)} disabled={busy}>Xoá</button>
                  <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setRemoveFor(null)}>Huỷ</button>
                </span>
              ) : (
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setResetFor(m.id)}>Đặt lại mật khẩu</button>
                  {m.id !== d.me && <button type="button" className="btn-ghost h-8 text-[13px] text-[#df2f4a]" onClick={() => setRemoveFor(m.id)}>Xoá</button>}
                </span>
              ))}
          </li>
        ))}
      </ul>
      {d.invites.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{d.invites.length} link mời đang chờ sử dụng.</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="min-w-0 overflow-x-auto rounded border border-line-soft">
          <table className="w-full min-w-[460px] text-[13.5px]">
            <thead className="bg-surface-2 text-left text-[12.5px] text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Quyền</th>
                {d.roles.map((r) => (
                  <th key={r.key} className="w-24 px-2 py-2 text-center font-medium" style={{ color: ROLE_COLOR[r.key] }}>
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              <tr>
                <td className="px-3 py-2">Thêm, sửa khách và việc trong phạm vi được xem</td>
                {d.roles.map((r) => (
                  <td key={r.key} className="text-center text-success">✓</td>
                ))}
              </tr>
              {d.permissions.map((p) => (
                <tr key={p.action}>
                  <td className="px-3 py-2">{p.label}</td>
                  {d.roles.map((r) => (
                    <td key={r.key} className={`text-center ${p[r.key] ? "text-success" : "text-ink-2"}`} aria-label={p[r.key] ? "Có" : "Không"}>
                      {p[r.key] ? "✓" : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-line-soft p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Nhân viên chỉ thấy khách của mình</p>
              <p className="mt-1 text-[13px] text-ink-2">Khi bật, Nhân viên chỉ xem và sửa được mục mình phụ trách và mục chưa giao. Chủ và Quản lý vẫn thấy tất cả.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={d.memberSeesOwnOnly}
              aria-label="Nhân viên chỉ thấy khách của mình"
              disabled={!d.canManageSettings || busy}
              onClick={toggleOwnOnly}
              className={`relative mt-0.5 h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${d.memberSeesOwnOnly ? "bg-[#00c875]" : "bg-[var(--line)]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.memberSeesOwnOnly ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {!d.canManageSettings && <p className="mt-2 text-[12.5px] text-ink-2">Chỉ chủ workspace đổi được cài đặt này.</p>}
        </div>
      </div>
    </section>
  );
}
