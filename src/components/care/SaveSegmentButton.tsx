"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import type { Filter } from "@/components/board/model";

/** Nút "Lưu thành nhóm khách" trên thanh công cụ bảng: hỏi tên rồi lưu bộ lọc đang dùng. */
export function SaveSegmentButton({ objectKey, filters, mode }: { objectKey: string; filters: Filter[]; mode: "and" | "or" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const active = filters.filter((f) => f.op === "empty" || f.op === "not_empty" || f.value !== "");
  if (!active.length) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch("/api/segments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, objectKey, filters: active, mode }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    setMsg({ ok: true, text: `Đã lưu nhóm “${j.name}”` });
    setName("");
    setTimeout(() => {
      setOpen(false);
      setMsg(null);
    }, 1500);
  }

  return (
    <div className="relative">
      <button type="button" className="btn-ghost" onClick={() => { setOpen(!open); setMsg(null); }} aria-expanded={open} title="Lưu bộ lọc đang dùng thành nhóm khách">
        <Icon name="segment" size={16} /> Lưu nhóm
      </button>
      {open && (
        <form onSubmit={submit} className="anim-pop absolute right-0 top-full z-40 mt-1 grid w-[min(300px,calc(100vw-32px))] gap-2 rounded-lg bg-surface p-3 shadow-panel max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-24 max-sm:w-auto">
          <b className="text-[14px]">Lưu thành nhóm khách</b>
          <p className="text-[12.5px] text-ink-2">{active.length} điều kiện, khớp {mode === "and" ? "tất cả" : "bất kỳ"}. Nhóm tự cập nhật khi dữ liệu đổi.</p>
          <input className="input h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm, ví dụ: Khách VIP" maxLength={80} autoFocus aria-label="Tên nhóm" />
          {msg && <p className={`text-[12.5px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <a href="/w/segments" className="btn-ghost h-7 mr-auto text-[13px] text-ink-2">
              Xem các nhóm
            </a>
            <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setOpen(false)}>
              Huỷ
            </button>
            <button type="submit" className="btn-primary h-7 text-[13px]" disabled={busy || !name.trim()}>
              Lưu
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
