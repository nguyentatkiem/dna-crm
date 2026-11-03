"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

type M = { id: string; name: string; email: string; role: string };
type Data = { me: string; isOwner: boolean; members: M[]; invites: { token: string; expiresAt: string }[] };

export function Members() {
  const [d, setD] = useState<Data | null>(null);
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [removeFor, setRemoveFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/members");
    if (r.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    const r = await fetch("/api/members", { method: "POST" });
    const j = await r.json();
    if (r.ok) {
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
    const r = await fetch(`/api/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    const j = await r.json();
    setMsg(r.ok ? "Đã đặt lại mật khẩu. Hãy gửi mật khẩu mới cho thành viên." : j.error);
    if (r.ok) {
      setResetFor(null);
      setPw("");
    }
  }
  async function remove(id: string) {
    const r = await fetch(`/api/members/${id}`, { method: "DELETE" });
    setRemoveFor(null);
    if (r.ok) load();
  }

  if (!d) return <section className="card mt-4 p-5 text-ink-2">Đang tải thành viên...</section>;

  return (
    <section className="card mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Thành viên</h2>
          <p className="mt-1 text-[14px] text-ink-2">Mời nhân viên bằng link dùng một lần, hết hạn sau 7 ngày.</p>
        </div>
        {d.isOwner && (
          <button type="button" className="btn-primary" onClick={invite}>
            <Icon name="link" size={16} /> Tạo link mời
          </button>
        )}
      </div>
      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded bg-surface-2 p-2.5">
          <code className="min-w-0 flex-1 break-all text-[12.5px]">{link}</code>
          <button type="button" className="btn-outline h-7 text-[13px]" onClick={copy}>
            Sao chép
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}
      <ul className="mt-3 grid divide-y divide-[var(--line-soft)]">
        {d.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <Avatar name={m.name} size={32} />
            <span className="min-w-0 flex-1">
              <b className="text-[14px]">{m.name}</b>
              {m.id === d.me && <span className="text-[12px] text-ink-2"> (bạn)</span>}
              <span className="block truncate text-[12.5px] text-ink-2">{m.email}</span>
            </span>
            <span className={`rounded px-2 py-0.5 text-[12px] text-white ${m.role === "owner" ? "bg-[#a25ddc]" : "bg-[#579bfc]"}`}>{m.role === "owner" ? "Chủ" : "Thành viên"}</span>
            {d.isOwner &&
              (resetFor === m.id ? (
                <span className="flex items-center gap-2">
                  <input id={`pw-${m.id}`} type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mật khẩu mới" className="input h-8 w-40" />
                  <button type="button" className="btn-primary h-8 text-[13px]" disabled={pw.length < 8} onClick={() => reset(m.id)}>Lưu</button>
                  <button type="button" className="btn-ghost h-8 text-[13px]" onClick={() => setResetFor(null)}>Huỷ</button>
                </span>
              ) : removeFor === m.id ? (
                <span className="flex items-center gap-2 text-[13px]">
                  Xoá khỏi workspace?
                  <button type="button" className="btn h-8 bg-[#df2f4a] text-[13px] text-white" onClick={() => remove(m.id)}>Xoá</button>
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
    </section>
  );
}
