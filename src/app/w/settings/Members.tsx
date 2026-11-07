"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

/** Khoá vai trò: "owner" | "manager" | "member" hoặc vai trò tự tạo ("r_..."). */
type Role = string;
type M = { id: string; name: string; email: string; role: Role; roleName: string; roleColor: string; inTeam: boolean };
type Matrix = { key: string; label: string; actions: { key: string; label: string; ownerOnly: boolean; roles: Record<string, boolean> }[] }[];
type Data = {
  me: string;
  myRole: Role;
  myRoleName: string;
  isOwner: boolean;
  canManageSettings: boolean;
  canSeeAudit: boolean;
  roles: { key: Role; label: string; color: string; builtin: boolean }[];
  matrix: Matrix;
  memberSeesOwnOnly: boolean;
  team: string[];
  members: M[];
  invites: { token: string; role: Role; roleName: string; expiresAt: string }[];
};

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
  /** Đăng xuất thành viên khỏi mọi thiết bị (và mở khoá tạm nếu đang bị khoá). */
  async function signOutAll(m: M) {
    const { ok, j } = await call(`/api/security/members/${m.id}`, "DELETE");
    setMsg(ok ? `Đã đăng xuất ${m.name} khỏi ${j.revoked} phiên.` : j.error);
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
  const roleLabel = (r: Role) => d.roles.find((x) => x.key === r)?.label ?? "Vai trò không xác định";
  const roleColor = (r: Role) => d.roles.find((x) => x.key === r)?.color ?? "#c4c4c4";
  const counts = Object.fromEntries(d.roles.map((r) => [r.key, d.matrix.reduce((n, g) => n + g.actions.filter((a) => !a.ownerOnly && a.roles[r.key]).length, 0)]));
  const totalPerms = d.matrix.reduce((n, g) => n + g.actions.filter((a) => !a.ownerOnly).length, 0);
  const missing = d.members.filter((m) => !m.inTeam);

  return (
    <section id="members" className="card mt-4 scroll-mt-4 p-5">
      <div data-tour="settings-members" className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Thành viên & phân quyền</h2>
          <p className="mt-1 text-[14px] text-ink-2">Mời nhân viên bằng link dùng một lần, hết hạn sau 7 ngày. Vai trò của bạn: {roleLabel(d.myRole)}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/w/settings/roles" className="btn-outline">
            <Icon name="shield" size={16} /> Vai trò & quyền
          </Link>
          {d.canSeeAudit && (
            <Link href="/w/settings/audit" className="btn-outline">
              <Icon name="history" size={16} /> Nhật ký thao tác
            </Link>
          )}
          {d.isOwner && (
            <>
              <select id="invite-role" aria-label="Vai trò người được mời" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="input h-9 w-auto">
                {d.roles
                  .filter((r) => r.key !== "owner")
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      Mời làm {r.label}
                    </option>
                  ))}
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
                style={{ color: roleColor(m.role) }}
              >
                {!d.roles.some((r) => r.key === m.role) && <option value={m.role}>Vai trò không xác định</option>}
                {d.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded px-2 py-0.5 text-[12px] text-white" style={{ background: roleColor(m.role) }}>
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
                  {m.id !== d.me && <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => signOutAll(m)} disabled={busy} title="Đăng xuất người này khỏi mọi thiết bị">Đăng xuất mọi nơi</button>}
                  {m.id !== d.me && <button type="button" className="btn-ghost h-8 text-[13px] text-[#df2f4a]" onClick={() => setRemoveFor(m.id)}>Xoá</button>}
                </span>
              ))}
          </li>
        ))}
      </ul>
      {d.invites.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{d.invites.length} link mời đang chờ sử dụng.</p>}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="min-w-0 rounded border border-line-soft">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft bg-surface-2 px-3 py-2">
            <span className="text-[13px] font-medium text-ink-2">Vai trò trong workspace</span>
            <Link href="/w/settings/roles?tab=compare" className="text-[13px] text-primary hover:underline">
              So sánh chi tiết {totalPerms} quyền →
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line-soft)]">
            {d.roles.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[13.5px]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: r.color }} />
                <span className="min-w-0 flex-1 font-medium">{r.label}</span>
                <span className="text-[12.5px] text-ink-2 tnum">
                  {counts[r.key]}/{totalPerms} quyền · {d.members.filter((m) => m.role === r.key).length} người
                </span>
                <Link href={`/w/settings/roles?role=${r.key}`} className="btn-ghost h-7 px-2 text-[12.5px]">
                  {d.isOwner && r.key !== "owner" ? "Sửa" : "Xem"}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-line-soft p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Nhân viên chỉ thấy khách của mình</p>
              <p className="mt-1 text-[13px] text-ink-2">Khi bật, vai trò Nhân viên chỉ xem và sửa được mục mình phụ trách và mục chưa giao. Phạm vi “Của cả đội” và vai trò khác: chỉnh ở Vai trò & quyền.</p>
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
