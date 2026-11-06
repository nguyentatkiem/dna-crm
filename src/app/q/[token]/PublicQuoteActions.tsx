"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Khách chấp nhận (ghi tên) hoặc từ chối (ghi lý do) báo giá. */
export function PublicQuoteActions({ token, customerName }: { token: string; customerName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);
  const [name, setName] = useState(customerName);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (mode === "accept" && name.trim().length < 2) return setErr("Vui lòng nhập họ tên người xác nhận");
    setBusy(true);
    const res = await fetch(`/api/public/quote/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, name, reason }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Có lỗi, vui lòng thử lại");
    router.refresh();
  }

  return (
    <section className="rounded-xl bg-surface p-5 shadow-card">
      {!mode ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 basis-60 text-[14.5px]">Quý khách đồng ý với báo giá này?</p>
          <button type="button" className="btn-primary h-10 px-5" onClick={() => setMode("accept")}>
            <Icon name="check" size={16} /> Chấp nhận
          </button>
          <button type="button" className="btn-outline h-10 px-5" onClick={() => setMode("reject")}>
            Từ chối
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {mode === "accept" ? (
            <label className="grid gap-1">
              <span className="label">Họ tên người xác nhận</span>
              <input className="input h-10" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus autoComplete="name" />
            </label>
          ) : (
            <label className="grid gap-1">
              <span className="label">Lý do (không bắt buộc)</span>
              <textarea className="textarea min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} autoFocus placeholder="Giá, thời gian, nhu cầu thay đổi…" />
            </label>
          )}
          {err && (
            <p role="alert" className="text-[13.5px] text-danger">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={mode === "accept" ? "btn-primary h-10 px-5" : "btn h-10 bg-[#df2f4a] px-5 text-white"} disabled={busy} onClick={submit}>
              {mode === "accept" ? "Xác nhận chấp nhận" : "Gửi từ chối"}
            </button>
            <button type="button" className="btn-ghost h-10" onClick={() => setMode(null)}>
              Quay lại
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
