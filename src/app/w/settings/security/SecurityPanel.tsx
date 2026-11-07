"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type S = { id: string; device: string; ip: string; createdAt: string; lastSeenAt: string; current: boolean };
type Data = { totpEnabled: boolean; recoveryLeft: number; isOwner: boolean; policy: "none" | "owners" | "managers"; legacySession: boolean; sessions: S[] };

const when = (s: string) => new Date(s).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ago = (s: string) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60_000);
  if (m < 5) return "Đang hoạt động";
  if (m < 60) return `${m} phút trước`;
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`;
  return when(s);
};

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j } as { ok: boolean; j: Record<string, unknown> & { error?: string } };
}

export function SecurityPanel({ email }: { email: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/security");
    if (r.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  if (!d) return <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface-2" />;

  return (
    <>
      {msg && (
        <p role="status" className={`mt-4 max-w-3xl rounded-lg px-4 py-2.5 text-[14px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}
      <div className="mt-5 grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid min-w-0 content-start gap-4">
          <TwoFactor d={d} email={email} reload={load} say={say} />
          {d.isOwner && <Policy d={d} reload={load} say={say} />}
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <Password say={say} reload={load} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Sessions d={d} reload={load} say={say} busy={busy} setBusy={setBusy} />
        </div>
      </div>
    </>
  );
}

type P = { d: Data; reload: () => void; say: (ok: boolean, t: string) => void };

function TwoFactor({ d, email, reload, say }: P & { email: string }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [off, setOff] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(body: Record<string, string>) {
    setBusy(true);
    const r = await api("/api/security/2fa", "POST", body);
    setBusy(false);
    if (!r.ok) say(false, r.j.error ?? "Không thực hiện được");
    return r;
  }
  async function start() {
    const r = await run({ action: "setup" });
    if (r.ok) setSetup({ qr: String(r.j.qr), secret: String(r.j.secret) });
  }
  async function enable() {
    const r = await run({ action: "enable", code });
    if (!r.ok) return;
    setCodes(r.j.codes as string[]);
    setSetup(null);
    setCode("");
    say(true, "Đã bật xác thực 2 lớp. Hãy lưu các mã khôi phục bên dưới.");
    reload();
  }
  async function disable() {
    const r = await run({ action: "disable", code, password: pw });
    if (!r.ok) return;
    setOff(false);
    setCode("");
    setPw("");
    say(true, "Đã tắt xác thực 2 lớp.");
    reload();
  }
  async function regen() {
    const r = await run({ action: "recovery", code });
    if (!r.ok) return;
    setCodes(r.j.codes as string[]);
    setCode("");
    say(true, "Đã tạo 10 mã khôi phục mới. Các mã cũ không dùng được nữa.");
    reload();
  }
  const download = () => {
    if (!codes) return;
    const blob = new Blob([`Mã khôi phục DNA CRM (${email})\nMỗi mã dùng được một lần khi mất điện thoại.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dna-crm-ma-khoi-phuc.txt";
    a.click();
  };

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Icon name="shield" size={18} className="text-primary" /> Xác thực 2 lớp
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-2">Ngoài mật khẩu, khi đăng nhập cần thêm mã 6 số từ ứng dụng trên điện thoại. Kẻ gian biết mật khẩu cũng không vào được.</p>
        </div>
        {d.totpEnabled ? <span className="badge-success">Đang bật</span> : <span className="badge">Chưa bật</span>}
      </div>

      {codes && (
        <div className="mt-4 rounded-lg border border-warning bg-warning-soft p-4">
          <b className="text-[14px]">Mã khôi phục — chỉ hiện một lần</b>
          <p className="mt-1 text-[13px] text-ink-2">Mất điện thoại thì đăng nhập bằng một mã dưới đây (mỗi mã dùng một lần). Hãy in ra hoặc lưu vào nơi an toàn.</p>
          <ol className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[14px] tnum">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-outline h-9" onClick={download}>
              <Icon name="download" size={15} /> Tải file .txt
            </button>
            <button type="button" className="btn-outline h-9" onClick={() => navigator.clipboard?.writeText(codes.join("\n")).then(() => say(true, "Đã sao chép mã khôi phục"))}>
              <Icon name="copy" size={15} /> Sao chép
            </button>
            <button type="button" className="btn-primary h-9" onClick={() => setCodes(null)}>
              Tôi đã lưu xong
            </button>
          </div>
        </div>
      )}

      {!d.totpEnabled && !setup && (
        <button type="button" className="btn-primary mt-4" onClick={start} disabled={busy}>
          <Icon name="lock" size={16} /> Bắt đầu bật
        </button>
      )}

      {!d.totpEnabled && setup && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="justify-self-start rounded-lg border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <div className="grid content-start gap-3 text-[13.5px]">
            <p>
              <b>1.</b> Cài <b>Google Authenticator</b> hoặc <b>Microsoft Authenticator</b> trên điện thoại.
            </p>
            <p>
              <b>2.</b> Trong ứng dụng chọn “Thêm” → “Quét mã QR”, quét mã bên cạnh. Không quét được thì nhập khoá:
              <code className="mt-1 block select-all break-all rounded bg-surface-2 px-2 py-1 font-mono text-[13px]">{setup.secret}</code>
            </p>
            <label className="grid gap-1">
              <span>
                <b>3.</b> Nhập mã 6 số đang hiện trong ứng dụng
              </span>
              <span className="flex gap-2">
                <input id="totp-enable" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="input h-10 w-36 text-center font-mono text-[17px] tracking-[0.25em]" placeholder="123456" />
                <button type="button" className="btn-primary h-10" onClick={enable} disabled={busy || code.replace(/\s/g, "").length !== 6}>
                  Xác nhận & bật
                </button>
              </span>
            </label>
            <button type="button" className="justify-self-start text-[13px] text-ink-2 hover:underline" onClick={() => setSetup(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {d.totpEnabled && (
        <div className="mt-4 grid gap-3">
          <p className="text-[13.5px] text-ink-2">
            Còn <b className="text-ink">{d.recoveryLeft}</b> mã khôi phục chưa dùng.
          </p>
          {!off ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[13px]">
                Mã 6 số hiện tại
                <input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="input h-9 w-32 text-center font-mono" placeholder="123456" />
              </label>
              <button type="button" className="btn-outline h-9" onClick={regen} disabled={busy || code.replace(/\s/g, "").length !== 6}>
                <Icon name="refresh" size={15} /> Tạo lại mã khôi phục
              </button>
              <button type="button" className="btn-ghost h-9 text-danger" onClick={() => setOff(true)}>
                Tắt xác thực 2 lớp
              </button>
            </div>
          ) : (
            <div className="grid gap-2 rounded-lg border border-line-soft p-3">
              <b className="text-[14px]">Tắt xác thực 2 lớp</b>
              <input id="totp-off-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mật khẩu" className="input h-9" />
              <input id="totp-off-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Mã 6 số hoặc mã khôi phục" className="input h-9 font-mono" />
              <span className="flex gap-2">
                <button type="button" className="btn h-9 bg-danger text-white" onClick={disable} disabled={busy || !pw || !code}>
                  Tắt
                </button>
                <button type="button" className="btn-ghost h-9" onClick={() => setOff(false)}>
                  Huỷ
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Sessions({ d, reload, say, busy, setBusy }: P & { busy: string; setBusy: (s: string) => void }) {
  async function revoke(id: string) {
    setBusy(id);
    const r = await api("/api/security/sessions", "DELETE", { id });
    setBusy("");
    if (!r.ok) return say(false, r.j.error ?? "Không đăng xuất được");
    if (r.j.current) return void (window.location.href = "/login");
    say(true, "Đã đăng xuất phiên đó.");
    reload();
  }
  async function others() {
    setBusy("others");
    const r = await api("/api/security/sessions", "DELETE", { others: true });
    setBusy("");
    if (!r.ok) return say(false, r.j.error ?? "Không đăng xuất được");
    say(true, `Đã đăng xuất ${r.j.revoked} phiên ở thiết bị khác.`);
    reload();
  }
  const otherCount = d.sessions.filter((s) => !s.current).length;
  return (
    <section className="card p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">Thiết bị đang đăng nhập</h2>
          <p className="text-[13px] text-ink-2">Thấy thiết bị lạ? Đăng xuất phiên đó và đổi mật khẩu.</p>
        </div>
        <button type="button" className="btn-outline h-9" onClick={others} disabled={!!busy || otherCount === 0}>
          <Icon name="logout" size={15} /> Đăng xuất mọi nơi khác
        </button>
      </header>
      {d.legacySession && <p className="border-b border-line-soft bg-info-soft px-5 py-2 text-[13px] text-info">Phiên hiện tại được tạo từ bản cũ, sẽ cần đăng nhập lại trong vòng 24 giờ.</p>}
      <ul className="divide-y divide-[var(--line-soft)]">
        {d.sessions.length === 0 && <li className="px-5 py-6 text-center text-[14px] text-ink-2">Không có phiên nào.</li>}
        {d.sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-surface-2 text-primary">
              <Icon name={/iPhone|Android|iPad/.test(s.device) ? "phone" : "server"} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14px]">
                {s.device} {s.current && <span className="badge-info ml-1">Thiết bị này</span>}
              </b>
              <span className="block text-[12.5px] text-ink-2">
                {s.ip ? `IP ${s.ip} · ` : ""}
                {ago(s.lastSeenAt)} · đăng nhập {when(s.createdAt)}
              </span>
            </span>
            <button type="button" className="btn-ghost h-8 text-[13px] text-danger" onClick={() => revoke(s.id)} disabled={!!busy}>
              {s.current ? "Đăng xuất" : "Đăng xuất phiên này"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Password({ say, reload }: { say: (ok: boolean, t: string) => void; reload: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) return say(false, "Hai lần nhập mật khẩu mới chưa khớp");
    setBusy(true);
    const r = await api("/api/security/password", "POST", { current: cur, next });
    setBusy(false);
    if (!r.ok) return say(false, r.j.error ?? "Không đổi được mật khẩu");
    setCur("");
    setNext("");
    setAgain("");
    say(true, `Đã đổi mật khẩu${r.j.revoked ? ` và đăng xuất ${r.j.revoked} phiên ở thiết bị khác` : ""}.`);
    reload();
  }
  return (
    <form className="card grid gap-3 p-5" onSubmit={save}>
      <h2 className="text-[16px] font-semibold">Đổi mật khẩu</h2>
      <label className="grid gap-1 text-[13px]">
        Mật khẩu hiện tại
        <input id="pw-cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} className="input h-10" />
      </label>
      <label className="grid gap-1 text-[13px]">
        Mật khẩu mới (ít nhất 8 ký tự)
        <input id="pw-new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} className="input h-10" />
      </label>
      <label className="grid gap-1 text-[13px]">
        Nhập lại mật khẩu mới
        <input id="pw-again" type="password" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} className="input h-10" />
      </label>
      <p className="text-[12.5px] text-ink-2">Đổi xong, mọi thiết bị khác sẽ bị đăng xuất.</p>
      <button className="btn-primary h-10 justify-self-start" disabled={busy}>
        {busy ? "Đang lưu..." : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

function Policy({ d, reload, say }: P) {
  const [busy, setBusy] = useState(false);
  const opts: { v: Data["policy"]; label: string; hint: string }[] = [
    { v: "none", label: "Không bắt buộc", hint: "Mỗi người tự chọn bật hay không." },
    { v: "owners", label: "Bắt buộc với Chủ", hint: "Chủ workspace phải bật mới dùng được CRM." },
    { v: "managers", label: "Bắt buộc với Chủ và Quản lý", hint: "Khuyên dùng: những người thấy toàn bộ dữ liệu." },
  ];
  async function pick(v: Data["policy"]) {
    setBusy(true);
    const r = await api("/api/security/policy", "PUT", { require2faFor: v });
    setBusy(false);
    if (!r.ok) return say(false, r.j.error ?? "Không lưu được");
    say(true, "Đã lưu chính sách xác thực 2 lớp.");
    reload();
  }
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold">Chính sách của workspace</h2>
      <p className="mt-1 text-[13px] text-ink-2">Bắt buộc bật xác thực 2 lớp theo vai trò. Người chưa bật sẽ được đưa tới trang này khi mở CRM.</p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Bắt buộc xác thực 2 lớp">
        {opts.map((o) => (
          <label key={o.v} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${d.policy === o.v ? "border-primary bg-primary-selected" : "border-line-soft"}`}>
            <input type="radio" name="policy" className="mt-1" checked={d.policy === o.v} disabled={busy} onChange={() => pick(o.v)} />
            <span>
              <b className="block text-[14px]">{o.label}</b>
              <span className="text-[12.5px] text-ink-2">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
