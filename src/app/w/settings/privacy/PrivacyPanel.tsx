"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import type { Privacy } from "@/lib/privacy";

type Sample = { name: string; phone: string; email: string; maskedPhone: string; maskedEmail: string };

function Toggle({ id, checked, onChange, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-primary" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function PrivacyPanel({ initial, sample }: { initial: Privacy; sample: Sample }) {
  const [p, setP] = useState(initial);
  const [limit, setLimit] = useState(String(initial.exportDailyLimit || ""));
  const [alert, setAlert] = useState(String(initial.alertExportRows || ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(patch: Partial<Privacy>) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/privacy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error ?? "Không lưu được" });
    setP(d);
    setLimit(String(d.exportDailyLimit || ""));
    setAlert(String(d.alertExportRows || ""));
    setMsg({ ok: true, text: "Đã lưu cài đặt bảo mật." });
  }

  const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/\D/g, "")) || 0));

  return (
    <div className="mt-5 grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="eye-off" size={18} /> Che thông tin liên hệ với nhân viên
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-2">Áp dụng cho vai trò Nhân viên ở bảng dữ liệu, ô chi tiết, tìm nhanh và file xuất. Nhân viên vẫn gọi được qua tổng đài trong app.</p>
          <div className="mt-4 grid gap-3">
            <label htmlFor="mask-phone" className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Che số điện thoại</span>
                <span className="text-[13px] text-ink-2">Hiện dạng {sample.maskedPhone}</span>
              </span>
              <Toggle id="mask-phone" checked={p.maskPhone} disabled={busy} onChange={(v) => save({ maskPhone: v })} />
            </label>
            <label htmlFor="mask-email" className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Che email</span>
                <span className="text-[13px] text-ink-2">Hiện dạng {sample.maskedEmail}</span>
              </span>
              <Toggle id="mask-email" checked={p.maskEmail} disabled={busy} onChange={(v) => save({ maskEmail: v })} />
            </label>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Icon name="download" size={18} /> Giới hạn xuất dữ liệu
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-2">Mỗi lần xuất Excel/CSV đều được ghi vào Nhật ký thao tác. Chủ workspace không bị giới hạn.</p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save({ exportDailyLimit: num(limit), alertExportRows: num(alert) });
            }}
          >
            <div>
              <label htmlFor="export-limit" className="label">
                Số dòng mỗi người / ngày
              </label>
              <input id="export-limit" className="input mt-1 tnum" inputMode="numeric" placeholder="Không giới hạn" value={limit} onChange={(e) => setLimit(e.target.value)} />
              <p className="mt-1 text-[12px] text-ink-2">Để trống hoặc 0 = không giới hạn.</p>
            </div>
            <div>
              <label htmlFor="export-alert" className="label">
                Báo chủ khi một lần xuất từ
              </label>
              <input id="export-alert" className="input mt-1 tnum" inputMode="numeric" placeholder="Không báo" value={alert} onChange={(e) => setAlert(e.target.value)} />
              <p className="mt-1 text-[12px] text-ink-2">dòng trở lên. Để trống = không báo.</p>
            </div>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={busy}>
                <Icon name="check" size={15} /> {busy ? "Đang lưu…" : "Lưu giới hạn"}
              </button>
            </div>
          </form>
        </section>

        {msg && (
          <p role="status" className={`rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
            {msg.text}
          </p>
        )}
      </div>

      <aside aria-label="Xem trước" className="card h-fit p-5">
        <h2 className="section-title">Xem trước</h2>
        {(["Chủ / Quản lý", "Nhân viên"] as const).map((who) => {
          const member = who === "Nhân viên";
          return (
            <div key={who} className="mt-3 rounded-lg border border-line-soft bg-surface-2 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                <Icon name={member ? "person" : "shield"} size={14} /> {who} thấy
              </div>
              <div className="flex items-center gap-3">
                <Avatar name={sample.name} size={32} />
                <div className="min-w-0 text-[13.5px]">
                  <div className="font-medium">{sample.name}</div>
                  <div className="tnum truncate text-ink-2">{member && p.maskPhone ? sample.maskedPhone : sample.phone}</div>
                  <div className="truncate text-ink-2">{member && p.maskEmail ? sample.maskedEmail : sample.email}</div>
                </div>
              </div>
            </div>
          );
        })}
        <p className="mt-3 text-[12px] text-ink-2">
          {p.exportDailyLimit > 0 ? `Mỗi người được xuất tối đa ${p.exportDailyLimit.toLocaleString("vi-VN")} dòng/ngày.` : "Chưa giới hạn số dòng xuất."}{" "}
          {p.alertExportRows > 0 ? `Báo chủ khi xuất từ ${p.alertExportRows.toLocaleString("vi-VN")} dòng.` : ""}
        </p>
      </aside>
    </div>
  );
}
