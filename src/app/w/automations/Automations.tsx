"use client";

import { useState } from "react";
import type { AutomationDef, WorkspaceConfig } from "@/lib/config/schema";
import { recipe } from "@/lib/recipe";
import { Icon } from "@/components/Icon";
import { Switch } from "@/app/onboarding/Wizard";

type Row = AutomationDef & { id: string; enabled: boolean; runs: number; createdAt: string };

export function Automations({ config, initial }: { config: WorkspaceConfig; initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function toggle(r: Row) {
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    await fetch(`/api/automations/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !r.enabled }) });
  }
  async function remove(r: Row) {
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    await fetch(`/api/automations/${r.id}`, { method: "DELETE" });
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(d.error ?? "Không tạo được công thức");
    setRows((rs) => [...rs, { ...d.automation }]);
    setText("");
    setMsg(d.source === "ai" ? "Automation Builder đã dựng công thức bằng AI. Kiểm tra lại câu bên dưới." : "Đã dựng công thức theo luật mẫu. Kiểm tra lại câu bên dưới.");
  }

  const example = config.objects.find((o) => o.key === "deals")?.statuses[3]?.label ?? "Đặt cọc";

  return (
    <div className="canvas px-6 pb-16 pt-6 sm:px-8">
      <h1 className="text-[26px] font-semibold">Tự động hoá</h1>
      <p className="mt-1 text-ink-2">Các công thức chạy nền 24/7 mỗi khi có mục mới hoặc đổi trạng thái.</p>

      <form onSubmit={create} className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-[#d9c5f0] bg-surface-2 p-3">
        <Icon name="spark" size={18} className="ml-1 text-[#a25ddc]" />
        <input
          id="auto-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Mô tả bằng lời, ví dụ: Khi giai đoạn đổi thành ${example} thì tạo việc gọi xác nhận sau 1 ngày`}
          className="h-9 min-w-0 flex-1 bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-2"
        />
        <button className="btn-primary" disabled={busy || text.trim().length < 5}>
          {busy ? "Đang dựng..." : "Tạo công thức"}
        </button>
      </form>
      {msg && <p className="mt-2 text-[13px] text-ink-2">{msg}</p>}

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <article key={r.id} className={`card grid gap-3 p-5 ${r.enabled ? "" : "opacity-60"}`}>
            <p className="text-[15.5px] leading-relaxed">
              {recipe(r, config).map((p, j) =>
                p.strong ? (
                  <b key={j} className="underline decoration-line decoration-2 underline-offset-4">
                    {p.text}
                  </b>
                ) : (
                  <span key={j}>{p.text}</span>
                ),
              )}
            </p>
            <div className="flex items-center justify-between text-[13px] text-ink-2">
              <span>
                {r.enabled ? "Đang chạy" : "Đã tắt"} · đã chạy {r.runs} lần
              </span>
              <span className="flex items-center gap-2">
                <button type="button" className="btn-ghost h-7 px-2 text-[13px]" onClick={() => remove(r)}>
                  Xoá
                </button>
                <Switch on={r.enabled} onChange={() => toggle(r)} label="Bật công thức" />
              </span>
            </div>
          </article>
        ))}
        {rows.length === 0 && <p className="py-10 text-center text-ink-2 lg:col-span-2">Chưa có công thức nào. Mô tả quy trình ở ô bên trên để tạo công thức đầu tiên.</p>}
      </div>
    </div>
  );
}
