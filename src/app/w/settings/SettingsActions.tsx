"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsActions({ mode, configId }: { mode: "restore" | "clear-sample"; configId?: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res =
      mode === "restore"
        ? await fetch("/api/config/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configId }) })
        : await fetch("/api/sample", { method: "DELETE" });
    setBusy(false);
    setConfirm(false);
    if (res.ok) router.refresh();
  }

  if (!confirm) {
    return (
      <button type="button" className={mode === "restore" ? "btn-outline h-7 text-[13px]" : "btn-outline text-[#df2f4a]"} onClick={() => setConfirm(true)}>
        {mode === "restore" ? "Khôi phục" : "Xoá dữ liệu mẫu"}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-[13px]">
      {mode === "restore" ? "Dùng lại phiên bản này?" : "Xoá vĩnh viễn các mục mẫu?"}
      <button type="button" className="btn-primary h-7 text-[13px]" onClick={run} disabled={busy}>
        {busy ? "Đang xử lý..." : "Xác nhận"}
      </button>
      <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setConfirm(false)}>
        Huỷ
      </button>
    </span>
  );
}
