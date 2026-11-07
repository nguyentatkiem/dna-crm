"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/** Đăng nhập 2 bước: email + mật khẩu, rồi mã xác thực 2 lớp nếu tài khoản đã bật. */
export function LoginForm({ note }: { note?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [step2, setStep2] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const cred = useRef<{ email: string; password: string }>({ email: "", password: "" });

  async function send(body: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Có lỗi xảy ra, thử lại sau");
      setBusy(false);
      return;
    }
    if (data.need2fa) {
      setStep2(true);
      setBusy(false);
      setTimeout(() => document.getElementById("f-code")?.focus(), 30);
      return;
    }
    window.location.href = data.redirect ?? "/";
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!step2) {
      cred.current = { email: f.email ?? "", password: f.password ?? "" };
      return send(cred.current);
    }
    return send({ ...cred.current, code: f.code ?? "" });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {!step2 ? (
        <>
          <label className="grid gap-1.5">
            <span className="text-[14px] font-medium">Email</span>
            <input id="f-email" name="email" type="email" placeholder="ban@doanhnghiep.vn" required autoComplete="email" className="input h-11" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[14px] font-medium">Mật khẩu</span>
            <span className="relative">
              <input id="f-password" name="password" type={reveal ? "text" : "password"} required autoComplete="current-password" className="input h-11 pr-11" />
              <button type="button" onClick={() => setReveal(!reveal)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded text-ink-2 hover:text-ink" aria-label={reveal ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={reveal}>
                <Icon name={reveal ? "eye-off" : "eye"} size={16} />
              </button>
            </span>
          </label>
        </>
      ) : (
        <div className="grid gap-3">
          <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-[13.5px] text-ink-2">
            <Icon name="shield" size={16} className="mt-px flex-none text-primary" />
            {recovery ? "Nhập một trong các mã khôi phục bạn đã lưu khi bật xác thực 2 lớp. Mỗi mã chỉ dùng được một lần." : "Mở ứng dụng xác thực (Google Authenticator, Microsoft Authenticator...) và nhập mã 6 số của DNA CRM."}
          </p>
          <label className="grid gap-1.5">
            <span className="text-[14px] font-medium">{recovery ? "Mã khôi phục" : "Mã xác thực"}</span>
            <input
              key={recovery ? "r" : "t"}
              id="f-code"
              name="code"
              required
              autoComplete="one-time-code"
              inputMode={recovery ? "text" : "numeric"}
              pattern={recovery ? undefined : "\\d{3}\\s?\\d{3}"}
              maxLength={recovery ? 14 : 7}
              placeholder={recovery ? "xxxxx-xxxxx" : "123456"}
              className="input h-11 text-center font-mono text-[18px] tracking-[0.3em]"
            />
          </label>
          <span className="flex flex-wrap justify-between gap-2 text-[13px]">
            <button type="button" className="text-primary hover:underline" onClick={() => setRecovery(!recovery)}>
              {recovery ? "Dùng mã từ ứng dụng" : "Mất điện thoại? Dùng mã khôi phục"}
            </button>
            <button
              type="button"
              className="text-ink-2 hover:underline"
              onClick={() => {
                setStep2(false);
                setRecovery(false);
                setError("");
              }}
            >
              ← Quay lại
            </button>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="anim-fade flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <Icon name="x" size={15} className="mt-px flex-none" /> {error}
        </p>
      )}
      <button className="btn-primary h-11 justify-center text-[15px]" disabled={busy}>
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {busy ? "Đang xử lý..." : step2 ? "Xác nhận" : "Đăng nhập"}
      </button>
      {note && !step2 && <p className="text-center text-[13px] text-ink-2">{note}</p>}
    </form>
  );
}
