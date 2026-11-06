"use client";

import { useState } from "react";

type Fields = { phone: boolean; email: boolean; note: boolean };

/** Form đăng ký trên landing page: JS duy nhất của trang. Đọc UTM từ đường dẫn. */
export function LeadForm({ slug, fields, button, thanks, color, preview }: { slug: string; fields: Fields; button: string; thanks: string; color: string; preview?: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState(thanks);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview) return;
    const fd = new FormData(e.currentTarget);
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) if (q.get(k)) utm[k] = q.get(k)!.slice(0, 200);
    setState("busy");
    setErr("");
    const r = await fetch(`/api/public/lp/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone") ?? "", email: fd.get("email") ?? "", note: fd.get("note") ?? "", website: fd.get("website") ?? "", utm }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) {
      setState("idle");
      setErr(j.error ?? "Chưa gửi được, vui lòng thử lại.");
      return;
    }
    setMsg(j.thanks || thanks);
    setState("done");
  }

  if (state === "done")
    return (
      <div role="status" className="rounded-xl bg-[#effaf4] px-5 py-6 text-center text-[16px] text-[#166c43]">
        <p className="text-[28px]" aria-hidden="true">✓</p>
        <p className="mt-1 font-medium">{msg}</p>
      </div>
    );

  const input = "h-12 w-full rounded-lg border border-[#d0d4e4] bg-white px-4 text-[16px] text-[#1f2430] outline-none placeholder:text-[#8a8fa3] focus:border-[var(--lp)]";
  return (
    <form onSubmit={submit} className="grid gap-3">
      <input name="name" required maxLength={120} placeholder="Họ và tên *" autoComplete="name" className={input} aria-label="Họ và tên" />
      {fields.phone && <input name="phone" type="tel" inputMode="tel" required={!fields.email} maxLength={20} placeholder={`Số điện thoại${fields.email ? "" : " *"}`} autoComplete="tel" className={input} aria-label="Số điện thoại" />}
      {fields.email && <input name="email" type="email" maxLength={120} placeholder="Email" autoComplete="email" className={input} aria-label="Email" />}
      {fields.note && <textarea name="note" maxLength={2000} rows={3} placeholder="Anh/chị cần tư vấn gì?" className={`${input} h-auto py-3`} aria-label="Lời nhắn" />}
      {/* Bẫy bot: người thật không thấy ô này */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      {err && <p className="rounded-lg bg-[#fdecef] px-3 py-2 text-[14px] text-[#b4233c]">{err}</p>}
      <button type="submit" disabled={state === "busy"} className="h-12 rounded-lg px-5 text-[16px] font-semibold text-white disabled:opacity-60" style={{ background: color }}>
        {state === "busy" ? "Đang gửi…" : button || "Gửi thông tin"}
      </button>
      <p className="text-center text-[12.5px] text-[#8a8fa3]">Thông tin của bạn chỉ dùng để tư vấn, không chia sẻ cho bên thứ ba.</p>
    </form>
  );
}
