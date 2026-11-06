"use client";

import { useState } from "react";
import type { Company } from "@/lib/prefs";
import { Icon } from "@/components/Icon";

const FIELDS: { key: keyof Company; label: string; hint?: string; long?: boolean; type?: string }[] = [
  { key: "name", label: "Tên doanh nghiệp" },
  { key: "taxCode", label: "Mã số thuế" },
  { key: "address", label: "Địa chỉ" },
  { key: "phone", label: "Điện thoại", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "logoUrl", label: "Link logo", hint: "Ảnh PNG/JPG công khai, hiện ở góc trái chứng từ", type: "url" },
  { key: "bank", label: "Tài khoản ngân hàng", hint: "Ví dụ: Vietcombank – STK 0071… – CN Sài Gòn", long: true },
  { key: "quoteTerms", label: "Điều khoản mặc định của báo giá", hint: "Điền sẵn khi tạo báo giá mới", long: true },
  { key: "footer", label: "Chân trang chứng từ", long: true },
];

export function CompanyForm({ initial }: { initial: Company }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Không lưu được" });
    setF(j);
    setMsg({ ok: true, text: "Đã lưu thông tin doanh nghiệp" });
  }

  return (
    <form onSubmit={save} className="card mt-5 grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
      {FIELDS.map((x) => (
        <label key={x.key} className={`grid content-start gap-1 ${x.long || x.key === "address" ? "sm:col-span-2" : ""}`}>
          <span className="label">{x.label}</span>
          {x.long ? (
            <textarea className="textarea min-h-[80px]" value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} maxLength={5000} />
          ) : (
            <input className="input" type={x.type ?? "text"} value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} maxLength={1000} />
          )}
          {x.hint && <span className="text-[12px] text-ink-2">{x.hint}</span>}
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          <Icon name="check" size={15} /> Lưu
        </button>
        {msg && (
          <span role="status" className={`text-[13.5px] ${msg.ok ? "text-success" : "text-danger"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
