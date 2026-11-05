"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";

const AUTO: Record<string, string> = { email: "email", name: "name", password: "current-password" };

type Field = { name: string; label: string; type?: string; placeholder?: string };

export function AuthForm({
  endpoint,
  fields,
  submit,
  footer,
  note,
  hidden,
}: {
  endpoint: string;
  fields: Field[];
  submit: string;
  footer?: { text: string; href: string; link: string };
  note?: string;
  hidden?: Record<string, string>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isNew = endpoint.includes("register");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = { ...Object.fromEntries(new FormData(e.currentTarget)), ...hidden };
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Có lỗi xảy ra, thử lại sau");
      setBusy(false);
      return;
    }
    window.location.href = data.redirect ?? "/";
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {fields.map((f) => {
        const pw = f.type === "password";
        return (
          <label key={f.name} className="grid gap-1.5">
            <span className="text-[14px] font-medium">{f.label}</span>
            <span className="relative">
              <input
                id={`f-${f.name}`}
                name={f.name}
                type={pw && reveal ? "text" : (f.type ?? "text")}
                placeholder={f.placeholder}
                required
                autoComplete={pw && isNew ? "new-password" : AUTO[f.name]}
                minLength={pw && isNew ? 8 : undefined}
                className={`input h-11 ${pw ? "pr-11" : ""}`}
              />
              {pw && (
                <button type="button" onClick={() => setReveal(!reveal)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded text-ink-2 hover:text-ink" aria-label={reveal ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={reveal}>
                  <Icon name={reveal ? "eye-off" : "eye"} size={16} />
                </button>
              )}
            </span>
          </label>
        );
      })}
      {error && (
        <p role="alert" className="anim-fade flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <Icon name="x" size={15} className="mt-px flex-none" /> {error}
        </p>
      )}
      <button className="btn-primary h-11 justify-center text-[15px]" disabled={busy}>
        {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {busy ? "Đang xử lý..." : submit}
      </button>
      {footer && (
        <p className="text-center text-[13px] text-ink-2">
          {footer.text}{" "}
          <Link className="text-primary hover:underline" href={footer.href}>
            {footer.link}
          </Link>
        </p>
      )}
      {note && <p className="text-center text-[13px] text-ink-2">{note}</p>}
    </form>
  );
}
