"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { normCode } from "@/lib/voucher/shared";

export type AppliedVoucher = { code: string; discount: number; label: string };

/**
 * Ô "Mã giảm giá" trong form đơn hàng. Bấm Áp dụng → kiểm tra qua /api/vouchers/validate.
 * Đã áp mã thì tự kiểm tra lại khi tạm tính hoặc khách thay đổi.
 */
export function VoucherField({ base, contactId, orderId, initialCode = "", onChange }: { base: number; contactId: string | null; orderId?: string; initialCode?: string; onChange: (v: AppliedVoucher | null) => void }) {
  const [text, setText] = useState(initialCode);
  const [applied, setApplied] = useState<AppliedVoucher | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const want = useRef(initialCode);
  const cb = useRef(onChange);
  cb.current = onChange;

  async function check(code: string) {
    const c = normCode(code);
    if (!c) return;
    setBusy(true);
    const sp = new URLSearchParams({ code: c, subtotal: String(Math.max(0, Math.round(base))) });
    if (contactId) sp.set("contactId", contactId);
    if (orderId) sp.set("orderId", orderId);
    const r = await fetch(`/api/vouchers/validate?${sp}`);
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (want.current !== c) return;
    if (!r.ok) {
      setApplied(null);
      setErr(j.error ?? "Mã không hợp lệ");
      cb.current(null);
      return;
    }
    const v = { code: j.code, discount: j.discount, label: j.label };
    setErr("");
    setApplied(v);
    cb.current(v);
  }

  // Kiểm tra lại khi tạm tính/khách đổi (và lần đầu khi sửa đơn đã có mã).
  useEffect(() => {
    if (!want.current) return;
    const t = setTimeout(() => check(want.current), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, contactId]);

  const apply = () => {
    want.current = normCode(text);
    if (!want.current) return setErr("Nhập mã trước nhé");
    check(want.current);
  };
  const remove = () => {
    want.current = "";
    setText("");
    setApplied(null);
    setErr("");
    cb.current(null);
  };

  return (
    <div className="grid gap-1">
      <span className="label">Mã giảm giá</span>
      {applied ? (
        <div className="flex items-center gap-2 rounded border border-success/40 bg-success-soft px-3 py-2 text-[13px] text-success">
          <Icon name="gift" size={15} />
          <span className="min-w-0 flex-1">
            <b className="font-mono">{applied.code}</b> · {applied.label}
            <br />
            Giảm <b className="tnum">{applied.discount.toLocaleString("vi-VN")} ₫</b>
          </span>
          <button type="button" className="btn-ghost h-7 px-2" onClick={remove} aria-label="Bỏ mã giảm giá">
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input className="input font-mono uppercase" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())} placeholder="VD: SN7KQX4M" maxLength={30} aria-label="Mã giảm giá" />
          <button type="button" className="btn-outline flex-none" onClick={apply} disabled={busy}>
            {busy ? "…" : "Áp dụng"}
          </button>
        </div>
      )}
      {err && <span role="alert" className="text-[12px] text-danger">{err}</span>}
    </div>
  );
}
