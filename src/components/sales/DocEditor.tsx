"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { lineNet, totals, type Line } from "@/lib/sales/lines";
import { money } from "@/lib/sales/shared";
import { ContactPicker, DealPicker, ProductPicker, customerOfRecord, type ProductOpt } from "./Pickers";
import { TotalsBox } from "./LinesView";

export type DocDraft = {
  contactId: string | null;
  contactTitle: string;
  recordId: string | null;
  recordTitle: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  title: string;
  items: Line[];
  discount: number;
  validUntil: string;
  dueAt: string;
  note: string;
  terms: string;
};

/**
 * Soạn báo giá hoặc đơn hàng: chọn khách, gắn giao dịch, thêm dòng hàng, chiết khấu, điều khoản.
 * Tiền tính lại ngay khi gõ bằng cùng hàm totals() phía máy chủ dùng.
 */
export function DocEditor({ kind, id, initial, products, seeAll, dealLabel, backHref }: { kind: "quote" | "order"; id?: string; initial: DocDraft; products: ProductOpt[]; seeAll: boolean; dealLabel: string; backHref: string }) {
  const router = useRouter();
  const [d, setD] = useState<DocDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) => setD((x) => ({ ...x, items: x.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const t = useMemo(() => totals(d.items, d.discount), [d.items, d.discount]);

  const addProduct = (p: ProductOpt) => set("items", [...d.items, { productId: p.id, code: p.code, name: p.name, unit: p.unit, qty: 1, price: p.price, discountPct: 0, vatPct: p.vat }]);
  const addFree = () => set("items", [...d.items, { code: "", name: "", unit: "", qty: 1, price: 0, discountPct: 0, vatPct: 0 }]);

  async function save(intent: "draft" | "submit") {
    setErr("");
    if (!d.customerName.trim()) return setErr("Hãy chọn hoặc nhập tên khách");
    if (!d.items.length) return setErr("Hãy thêm ít nhất một dòng hàng");
    if (d.items.some((l) => !l.name.trim())) return setErr("Có dòng hàng chưa có tên");
    setBusy(true);
    const base = kind === "quote" ? "/api/quotes" : "/api/orders";
    const body = {
      ...d,
      intent,
      validUntil: kind === "quote" ? d.validUntil || null : undefined,
      dueAt: kind === "order" ? d.dueAt || null : undefined,
    };
    const res = await fetch(id ? `${base}/${id}` : base, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Không lưu được");
    router.push(`/w/${kind === "quote" ? "quotes" : "orders"}/${j.id ?? id}`);
    router.refresh();
  }

  const num = (v: string) => (v === "" ? 0 : Number(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-4">
        <section className="card grid gap-3 p-4">
          <h2 className="section-title">Khách hàng</h2>
          {d.contactId ? (
            <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className="badge-info">
                <Icon name="person" size={12} /> {d.contactTitle || d.customerName}
              </span>
              <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setD((x) => ({ ...x, contactId: null, contactTitle: "" }))}>
                Bỏ gắn
              </button>
            </p>
          ) : (
            <ContactPicker onPick={(c) => setD((x) => ({ ...x, contactId: c.id, contactTitle: c.title, customerName: c.title, customerPhone: c.phone || x.customerPhone, customerEmail: c.email || x.customerEmail }))} />
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="label">Tên khách *</span>
              <input className="input" value={d.customerName} onChange={(e) => set("customerName", e.target.value)} maxLength={200} />
            </label>
            <label className="grid gap-1">
              <span className="label">Số điện thoại</span>
              <input className="input tnum" inputMode="tel" value={d.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} maxLength={40} />
            </label>
            {kind === "quote" && (
              <label className="grid gap-1">
                <span className="label">Email</span>
                <input className="input" type="email" value={d.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} maxLength={200} />
              </label>
            )}
          </div>
          <div className="grid gap-1">
            <span className="label">{dealLabel}</span>
            {d.recordId ? (
              <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <span className="badge-accent">
                  <Icon name="deals" size={12} /> {d.recordTitle || "Đã gắn"}
                </span>
                <button type="button" className="btn-ghost h-7 text-[13px]" onClick={() => setD((x) => ({ ...x, recordId: null, recordTitle: "" }))}>
                  Bỏ gắn
                </button>
              </p>
            ) : (
              <DealPicker
                label={dealLabel}
                onPick={async (r) => {
                  setD((x) => ({ ...x, recordId: r.id, recordTitle: r.title }));
                  // Chưa chọn khách thì lấy khách của giao dịch.
                  if (!d.contactId) {
                    const c = await customerOfRecord(r.id);
                    if (c) setD((x) => (x.contactId ? x : { ...x, contactId: c.contactId, contactTitle: c.name, customerName: x.customerName || c.name, customerPhone: x.customerPhone || c.phone, customerEmail: x.customerEmail || c.email }));
                  }
                }}
              />
            )}
          </div>
          {kind === "quote" && (
            <label className="grid gap-1">
              <span className="label">Tiêu đề báo giá</span>
              <input className="input" value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Ví dụ: Gói chăm sóc da 10 buổi" maxLength={200} />
            </label>
          )}
        </section>

        <section className="card grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Dòng hàng</h2>
            <button type="button" className="btn-ghost h-8 text-[13px]" onClick={addFree}>
              <Icon name="plus" size={15} /> Dòng tự do
            </button>
          </div>
          <ProductPicker products={products} onPick={addProduct} />
          {d.items.length === 0 && <p className="py-4 text-center text-[13.5px] text-ink-2">Chưa có dòng hàng. Tìm sản phẩm ở trên hoặc thêm dòng tự do.</p>}
          <ol className="grid gap-2">
            {d.items.map((l, i) => (
              <li key={i} className="rounded-md border border-line-soft bg-surface p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 flex-none text-[12px] text-ink-2 tnum">{i + 1}</span>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_90px]">
                    <input className="input" aria-label="Tên dòng hàng" placeholder="Tên sản phẩm / dịch vụ" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={300} />
                    <input className="input" aria-label="Đơn vị" placeholder="Đơn vị" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} maxLength={40} />
                  </div>
                  <button type="button" className="btn-ghost h-9 w-9 flex-none justify-center p-0 text-ink-2" aria-label={`Xoá dòng ${i + 1}`} onClick={() => set("items", d.items.filter((_, j) => j !== i))}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 pl-7 sm:grid-cols-[80px_minmax(0,1fr)_80px_80px_minmax(0,1fr)]">
                  <label className="grid gap-0.5">
                    <span className="text-[11.5px] text-ink-2">Số lượng</span>
                    <input className="input tnum" inputMode="decimal" value={String(l.qty)} onChange={(e) => setLine(i, { qty: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} />
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-[11.5px] text-ink-2">Đơn giá</span>
                    <input className="input tnum" inputMode="numeric" value={l.price ? l.price.toLocaleString("vi-VN") : ""} placeholder="0" onChange={(e) => setLine(i, { price: Math.max(0, num(e.target.value)) })} />
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-[11.5px] text-ink-2">CK %</span>
                    <input className="input tnum" inputMode="decimal" value={l.discountPct ? String(l.discountPct) : ""} placeholder="0" onChange={(e) => setLine(i, { discountPct: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })} />
                  </label>
                  <label className="grid gap-0.5">
                    <span className="text-[11.5px] text-ink-2">VAT %</span>
                    <input className="input tnum" inputMode="decimal" value={l.vatPct ? String(l.vatPct) : ""} placeholder="0" onChange={(e) => setLine(i, { vatPct: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })} />
                  </label>
                  <div className="col-span-2 grid content-end justify-items-end gap-0.5 sm:col-span-1">
                    <span className="text-[11.5px] text-ink-2">Thành tiền</span>
                    <span className="font-semibold leading-9 tnum">{money(lineNet(l))}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card grid gap-3 p-4">
          <label className="grid gap-1">
            <span className="label">Ghi chú</span>
            <textarea className="textarea min-h-[70px]" value={d.note} onChange={(e) => set("note", e.target.value)} maxLength={3000} />
          </label>
          {kind === "quote" && (
            <label className="grid gap-1">
              <span className="label">Điều khoản</span>
              <textarea className="textarea min-h-[90px]" value={d.terms} onChange={(e) => set("terms", e.target.value)} maxLength={5000} />
            </label>
          )}
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-4">
        <section className="card grid gap-3 p-4">
          <label className="grid gap-1">
            <span className="label">Chiết khấu cả đơn (₫)</span>
            <input className="input tnum" inputMode="numeric" value={d.discount ? d.discount.toLocaleString("vi-VN") : ""} placeholder="0" onChange={(e) => set("discount", Math.max(0, num(e.target.value)))} />
            <span className="text-[12px] text-ink-2">Trừ trước thuế, chia theo tỷ lệ giá trị từng dòng.</span>
          </label>
          {kind === "quote" ? (
            <label className="grid gap-1">
              <span className="label">Hiệu lực đến</span>
              <input className="input" type="date" value={d.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </label>
          ) : (
            <label className="grid gap-1">
              <span className="label">Hạn thanh toán</span>
              <input className="input" type="date" value={d.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
            </label>
          )}
          <TotalsBox t={t} />
        </section>
        {err && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
            {err}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {kind === "quote" ? (
            <>
              <button type="button" className="btn-primary flex-1 justify-center" disabled={busy} onClick={() => save("submit")}>
                <Icon name="check" size={15} /> {seeAll ? "Lưu & duyệt" : "Gửi duyệt"}
              </button>
              <button type="button" className="btn-outline flex-1 justify-center" disabled={busy} onClick={() => save("draft")}>
                Lưu nháp
              </button>
            </>
          ) : (
            <button type="button" className="btn-primary flex-1 justify-center" disabled={busy} onClick={() => save("draft")}>
              <Icon name="check" size={15} /> {id ? "Lưu đơn" : "Tạo đơn"}
            </button>
          )}
          <Link href={backHref} className="btn-ghost justify-center">
            Huỷ
          </Link>
        </div>
      </aside>
    </div>
  );
}
