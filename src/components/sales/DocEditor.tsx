"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { lineNet, totals, type Line } from "@/lib/sales/lines";
import { money } from "@/lib/sales/shared";
import { priceFor, type PriceRuleLite } from "@/lib/sales/pricing";
import { fmtQty } from "@/lib/stock/shared";
import { ContactPicker, DealPicker, ProductPicker, customerOfRecord, type ProductOpt } from "./Pickers";
import { TotalsBox } from "./LinesView";
import { VoucherField, type AppliedVoucher } from "@/components/voucher/VoucherField";

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
  /** Đơn hàng: mã giảm giá đang áp (không gồm trong discount). */
  voucherCode?: string;
  /** Sửa đơn: số tiền giảm và mô tả của mã đang áp, để tổng tiền đúng ngay (trước khi kiểm tra lại mã). */
  voucherDiscount?: number;
  voucherLabel?: string;
};

/**
 * Soạn báo giá hoặc đơn hàng: chọn khách, gắn giao dịch, thêm dòng hàng, chiết khấu, điều khoản.
 * Tiền tính lại ngay khi gõ bằng cùng hàm totals() phía máy chủ dùng.
 */
/** Sản phẩm cho trình soạn: thêm tồn kho (activeProducts trả kèm). */
type Prod = ProductOpt & { trackStock?: boolean; stock?: number };
type TierInfo = { tier: { name: string; color: string } | null; rules: PriceRuleLite[] };

export function DocEditor({ kind, id, initial, products, seeAll, dealLabel, backHref }: { kind: "quote" | "order"; id?: string; initial: DocDraft; products: Prod[]; seeAll: boolean; dealLabel: string; backHref: string }) {
  const router = useRouter();
  const [d, setD] = useState<DocDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof DocDraft>(k: K, v: DocDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) => setD((x) => ({ ...x, items: x.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(initial.voucherCode && initial.voucherDiscount ? { code: initial.voucherCode, discount: initial.voucherDiscount, label: initial.voucherLabel ?? "" } : null);
  const t = useMemo(() => totals(d.items, d.discount + (kind === "order" ? voucher?.discount ?? 0 : 0)), [d.items, d.discount, voucher, kind]);
  const voucherBase = useMemo(() => totals(d.items, d.discount).subtotal - d.discount, [d.items, d.discount]);

  // Giá theo hạng của khách đang gắn (tự áp cho dòng thêm mới) + cấu hình kho (cảnh báo vượt tồn).
  const [tier, setTier] = useState<TierInfo>({ tier: null, rules: [] });
  const [allowNegative, setAllowNegative] = useState(true);
  useEffect(() => {
    let live = true;
    if (!d.contactId) {
      setTier({ tier: null, rules: [] });
      return;
    }
    fetch(`/api/price-rules/for?contactId=${encodeURIComponent(d.contactId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setTier({ tier: j.tier, rules: j.rules ?? [] }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [d.contactId]);
  useEffect(() => {
    fetch("/api/stock/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setAllowNegative(j.allowNegative !== false))
      .catch(() => undefined);
  }, []);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const tierPrice = (l: Line) => {
    const p = l.productId ? byId.get(l.productId) : undefined;
    if (!p || !tier.tier) return null;
    const r = priceFor({ basePrice: p.price, productId: p.id, category: p.category, tier: tier.tier.name, rules: tier.rules });
    return r.ruleId ? { ...r, list: p.price } : null;
  };
  // Tổng SL theo sản phẩm (nhiều dòng cùng sản phẩm cộng lại) để so với tồn.
  const need = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of d.items) if (l.productId) m.set(l.productId, (m.get(l.productId) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [d.items]);
  const pendingTier = d.items.filter((l) => !l.priceRuleId && tierPrice(l) && l.price === tierPrice(l)!.list).length;
  const applyTierAll = () => set("items", d.items.map((l) => {
    const t = !l.priceRuleId && tierPrice(l);
    return t && l.price === t.list ? { ...l, price: t.price, priceRuleId: t.ruleId ?? undefined, listPrice: t.list } : l;
  }));

  const addProduct = (p: Prod) => {
    const r = tier.tier ? priceFor({ basePrice: p.price, productId: p.id, category: p.category, tier: tier.tier.name, rules: tier.rules }) : null;
    const price = r?.ruleId ? r.price : p.price;
    set("items", [...d.items, { productId: p.id, code: p.code, name: p.name, unit: p.unit, qty: 1, price, discountPct: 0, vatPct: p.vat, listPrice: p.price, ...(r?.ruleId ? { priceRuleId: r.ruleId } : {}) }]);
  };
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
      voucherCode: kind === "order" ? voucher?.code ?? "" : undefined,
    };
    const res = await fetch(id ? `${base}/${id}` : base, { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    // Lưu xong giữ nút ở trạng thái bận tới khi chuyển trang, tránh bấm lần nữa tạo đơn trùng.
    if (!res.ok) {
      setBusy(false);
      return setErr(j.error ?? "Không lưu được");
    }
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
          {tier.tier && (
            <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
              <span className="badge" style={{ background: `${tier.tier.color}22`, color: tier.tier.color }}>
                Hạng {tier.tier.name}
              </span>
              {tier.rules.length ? "Giá hạng tự áp cho dòng thêm mới." : "Hạng này chưa có bảng giá riêng."}
              {pendingTier > 0 && (
                <button type="button" className="btn-ghost h-7 text-[12.5px]" onClick={applyTierAll}>
                  Áp giá hạng cho {pendingTier} dòng
                </button>
              )}
            </p>
          )}
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
                    <input className="input tnum" inputMode="numeric" value={l.price ? l.price.toLocaleString("vi-VN") : ""} placeholder="0" onChange={(e) => {
                        const price = Math.max(0, num(e.target.value));
                        const t = tierPrice(l);
                        setLine(i, { price, priceRuleId: t && t.price === price ? t.ruleId ?? undefined : undefined });
                      }} />
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
                <LineHints
                  l={l}
                  tierLabel={(() => {
                    const t = tierPrice(l);
                    return t ? { label: t.label, price: t.price, list: t.list, ruleId: t.ruleId ?? "" } : null;
                  })()}
                  color={tier.tier?.color}
                  prod={l.productId ? byId.get(l.productId) : undefined}
                  need={l.productId ? need.get(l.productId) ?? 0 : 0}
                  allowNegative={allowNegative}
                  kind={kind}
                  onPatch={(p) => setLine(i, p)}
                />
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
          {kind === "order" && <VoucherField base={voucherBase} contactId={d.contactId} orderId={id} initialCode={initial.voucherCode} initialApplied={voucher} onChange={setVoucher} />}
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

/** Dưới mỗi dòng: nhãn giá hạng (bỏ / áp lại) và cảnh báo vượt tồn kho. */
function LineHints({ l, tierLabel, color, prod, need, allowNegative, kind, onPatch }: { l: Line; tierLabel: { label: string; price: number; list: number; ruleId: string } | null; color?: string; prod?: Prod; need: number; allowNegative: boolean; kind: "quote" | "order"; onPatch: (p: Partial<Line>) => void }) {
  const applied = !!l.priceRuleId && !!tierLabel && l.price === tierLabel.price;
  const over = prod?.trackStock && typeof prod.stock === "number" && need > prod.stock;
  if (!applied && !tierLabel && !over) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7 text-[12.5px]">
      {applied && tierLabel && (
        <>
          <span className="badge" style={{ background: `${color ?? "#e2a400"}22`, color: color ?? "#b07d00" }}>
            {tierLabel.label}
          </span>
          <span className="text-ink-2 line-through tnum">{money(tierLabel.list)}</span>
          <button type="button" className="text-primary hover:underline" onClick={() => onPatch({ price: tierLabel.list, priceRuleId: undefined })}>
            Dùng giá niêm yết
          </button>
        </>
      )}
      {!applied && tierLabel && (
        <button type="button" className="text-primary hover:underline" onClick={() => onPatch({ price: tierLabel.price, priceRuleId: tierLabel.ruleId, listPrice: tierLabel.list })}>
          Áp giá {tierLabel.label.replace(/^Giá /, "")} ({money(tierLabel.price)})
        </button>
      )}
      {over && (
        <span role="status" className={allowNegative ? "text-warning" : "text-danger"}>
          ⚠ Vượt tồn kho: còn {fmtQty(prod!.stock ?? 0)} {prod!.unit}
          {!allowNegative && kind === "order" ? " — đơn sẽ không xác nhận được tới khi nhập thêm hàng" : allowNegative ? " (vẫn bán được, kho sẽ âm)" : ""}
        </span>
      )}
    </div>
  );
}
