"use client";

import Link from "next/link";
import { useState } from "react";

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
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1.5">
          <span className="text-[14px] font-medium">{f.label}</span>
          <input id={`f-${f.name}`} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required className="input h-10" />
        </label>
      ))}
      {error && <p className="rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}
      <button className="btn-primary h-10 justify-center" disabled={busy}>
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
