"use client";

import { useState } from "react";

export function LeadForm({ formKey, selects }: { formKey: string; selects: { key: string; label: string; options: string[] }[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    setError("");
    const fd = new FormData(e.currentTarget);
    const extra: Record<string, string> = {};
    selects.forEach((s) => {
      const v = String(fd.get(s.key) ?? "");
      if (v) extra[s.key] = v;
    });
    const res = await fetch(`/api/public/lead/${formKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email") || undefined, need: fd.get("need") || undefined, website: fd.get("website") || undefined, extra, utm: utm() }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "Chưa gửi được, thử lại giúp chúng tôi");
      setState("idle");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return <p className="mt-6 rounded-lg bg-[#d6f5e6] px-4 py-5 text-center text-[15px] text-[#037f4c]">Cảm ơn bạn! Chúng tôi đã nhận thông tin và sẽ liên hệ sớm.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-3.5">
      <label className="grid gap-1.5">
        <span className="text-[14px] font-medium">Họ tên *</span>
        <input id="lf-name" name="name" required className="input h-10" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[14px] font-medium">Số điện thoại *</span>
        <input id="lf-phone" name="phone" required inputMode="tel" className="input h-10" />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[14px] font-medium">Email</span>
        <input id="lf-email" name="email" type="email" className="input h-10" />
      </label>
      {selects.map((s) => (
        <label key={s.key} className="grid gap-1.5">
          <span className="text-[14px] font-medium">{s.label}</span>
          <select id={`lf-${s.key}`} name={s.key} className="input h-10">
            <option value="">Chọn...</option>
            {s.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      ))}
      <label className="grid gap-1.5">
        <span className="text-[14px] font-medium">Bạn cần tư vấn gì?</span>
        <textarea id="lf-need" name="need" className="textarea min-h-20" />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error && <p className="rounded bg-[#ffe0e5] px-3 py-2 text-[13px] text-[#a01c32]">{error}</p>}
      <button className="btn-primary h-10 justify-center" disabled={state === "busy"}>
        {state === "busy" ? "Đang gửi..." : "Gửi thông tin"}
      </button>
    </form>
  );
}

/** Đọc utm_* và referrer để biết lead đến từ quảng cáo hay tự nhiên. */
function utm() {
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid", "ttclid"]) {
    const v = q.get(k);
    if (v) out[k] = v.slice(0, 200);
  }
  if (document.referrer && !document.referrer.startsWith(window.location.origin)) out.referrer = document.referrer.slice(0, 200);
  return out;
}
