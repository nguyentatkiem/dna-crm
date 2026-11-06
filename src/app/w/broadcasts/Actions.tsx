"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

/** Nút thao tác trên một đợt gửi: chạy lượt gửi, huỷ, xoá. */
export function BroadcastActions({ id, status, name }: { id: string; status: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const call = async (url: string, init: RequestInit) => {
    setBusy(true);
    setErr(null);
    const r = await fetch(url, init);
    setBusy(false);
    if (!r.ok) {
      setErr((await r.json().catch(() => ({}))).error ?? "Có lỗi xảy ra");
      return false;
    }
    return true;
  };
  const json = { "Content-Type": "application/json" };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "sending" || status === "scheduled") && (
        <button type="button" className="btn-outline" disabled={busy} onClick={async () => (await call("/api/broadcasts/tick", { method: "POST" })) && router.refresh()} title="Gửi lô tiếp theo ngay, không chờ việc nền">
          <Icon name="play" size={16} /> {busy ? "Đang gửi…" : "Chạy lượt gửi"}
        </button>
      )}
      {["draft", "scheduled", "sending"].includes(status) && (
        <button
          type="button"
          className="btn-outline"
          disabled={busy}
          onClick={async () => confirm(`Huỷ đợt gửi “${name}”? Tin đã gửi không thu hồi được.`) && (await call(`/api/broadcasts/${id}`, { method: "PATCH", headers: json, body: JSON.stringify({ action: "cancel" }) })) && router.refresh()}
        >
          <Icon name="x" size={16} /> Huỷ gửi
        </button>
      )}
      {status !== "sending" && (
        <button
          type="button"
          className="btn-ghost text-danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Xoá đợt gửi “${name}”? Nhật ký gửi vẫn được giữ.`)) return;
            if (await call(`/api/broadcasts/${id}`, { method: "DELETE" })) {
              router.push("/w/broadcasts");
              router.refresh();
            }
          }}
        >
          <Icon name="trash" size={16} /> Xoá
        </button>
      )}
      {err && <p className="w-full rounded bg-danger-soft px-3 py-2 text-[13px] text-danger">{err}</p>}
    </div>
  );
}
