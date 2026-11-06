"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Drawer, toast } from "@/components/ui";
import { viMessage } from "@/lib/format";
import type { InboxItem, InboxRecord } from "@/lib/inbox-types";
import { totals, type Line } from "@/lib/sales/lines";
import { fold, renderQuickReply, varsFor } from "@/lib/quick-replies";
import { api } from "./shared";

type Product = { id: string; code: string; name: string; unit: string; category: string; price: number; vat: number };
type Voucher = { code: string; discount: number; label: string };

const CONFIRM_DEFAULT = "Dạ em xác nhận đơn {ma_don} của anh/chị {ten}:\n{san_pham}\nTổng thanh toán: {tong_tien}.\nĐịa chỉ giao: {dia_chi}\nEm cảm ơn anh/chị ạ!";
const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;

/** Tạo đơn hàng ngay trong hội thoại: chọn sản phẩm, số lượng, giá, chiết khấu, mã giảm giá, địa chỉ giao; tuỳ chọn nhắn xác nhận. */
export function OrderDrawer({ open, onClose, conv, record, me, businessName, address: initialAddress, onCreated }: { open: boolean; onClose: () => void; conv: InboxItem; record: InboxRecord | null; me: string; businessName: string; address: string; onCreated: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [canCreate, setCanCreate] = useState(true);
  const [pq, setPq] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [vErr, setVErr] = useState("");
  const [vBusy, setVBusy] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(conv.kind !== "comment");
  const [confirmText, setConfirmText] = useState(CONFIRM_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submitted = useRef(false);

  // Điền sẵn khi mở (chỉ lúc mở, không ghi đè khi lần làm mới 10 giây chạy giữa chừng).
  const init = useRef({ conv, record, initialAddress });
  init.current = { conv, record, initialAddress };
  useEffect(() => {
    if (!open) return;
    const { conv: c, record: r, initialAddress: addr } = init.current;
    submitted.current = false;
    setErr("");
    setName(r?.title ?? (/^Khách\b/.test(c.name) ? "" : c.name));
    setPhone(r?.phone || c.phones[0] || "");
    setAddress(r?.address || addr || "");
  }, [open]);
  const convId = conv.id;
  useEffect(() => {
    if (!open || products) return;
    let live = true;
    api<{ products: Product[]; canCreate: boolean }>(`/api/inbox/${convId}/order`)
      .then((r) => {
        if (!live) return;
        setProducts(r.products);
        setCanCreate(r.canCreate);
      })
      .catch(() => live && setProducts([]));
    return () => {
      live = false;
    };
  }, [open, products, convId]);

  const sum = useMemo(() => totals(lines, discount + (voucher?.discount ?? 0)), [lines, discount, voucher]);
  // Mã đã kiểm tra theo tạm tính cũ: đổi hàng thì kiểm tra lại.
  const subtotalForVoucher = useMemo(() => totals(lines, discount).subtotal - discount, [lines, discount]);
  useEffect(() => setVoucher(null), [subtotalForVoucher]);

  const found = useMemo(() => {
    const q = fold(pq.trim());
    return (products ?? []).filter((p) => !q || fold(`${p.code} ${p.name} ${p.category}`).includes(q)).slice(0, 30);
  }, [products, pq]);

  const add = (p: Product) =>
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: p.id, code: p.code, name: p.name, unit: p.unit, qty: 1, price: p.price, discountPct: 0, vatPct: p.vat }];
    });
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function checkVoucher() {
    const c = code.trim();
    if (!c || vBusy) return;
    setVBusy(true);
    setVErr("");
    try {
      const u = new URLSearchParams({ code: c, subtotal: String(subtotalForVoucher), contactId: record?.id ?? "" });
      const r = await api<Voucher>(`/api/vouchers/validate?${u}`);
      setVoucher(r);
    } catch (e) {
      setVoucher(null);
      setVErr(viMessage(e, "Mã không dùng được"));
    } finally {
      setVBusy(false);
    }
  }

  const preview = useMemo(() => {
    const items = lines.map((l) => `- ${l.name} x${l.qty}`).join("\n");
    return renderQuickReply(confirmText.replace(/\{san_pham\}/g, items).replace(/\{dia_chi\}/g, address || "(chưa có)"), varsFor({ ...conv, name: name || conv.name }, me, businessName));
  }, [confirmText, lines, address, conv, name, me, businessName]);

  async function submit() {
    if (busy || submitted.current) return;
    if (!lines.length) return setErr("Chọn ít nhất một sản phẩm");
    if (!name.trim()) return setErr("Cần tên khách");
    if (code.trim() && !voucher) return setErr("Bấm “Áp dụng” để kiểm tra mã giảm giá, hoặc xoá mã");
    setBusy(true);
    setErr("");
    submitted.current = true;
    try {
      const r = await api<{ order: { number: string; total: number }; confirm: { ok: boolean; error?: string } | null }>(`/api/inbox/${conv.id}/order`, {
        method: "POST",
        json: { customerName: name, customerPhone: phone, address, note, items: lines, discount, voucherCode: voucher?.code ?? "", confirmText: sendConfirm ? preview : "" },
      });
      toast(`Đã tạo đơn ${r.order.number} · ${money(r.order.total)}${r.confirm ? (r.confirm.ok ? " · đã nhắn xác nhận" : " · chưa gửi được tin xác nhận") : ""}`, r.confirm && !r.confirm.ok ? "error" : "info");
      setLines([]);
      setDiscount(0);
      setCode("");
      setVoucher(null);
      setNote("");
      onCreated();
      onClose();
    } catch (e) {
      submitted.current = false;
      setErr(viMessage(e, "Không tạo được đơn"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Tạo đơn hàng"
      subtitle={`Từ hội thoại với ${conv.name}`}
      width={560}
      footer={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[13px]">
            Tổng: <b className="tnum text-[15px]">{money(sum.total)}</b>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="button" className="btn-primary" disabled={busy || !canCreate || !lines.length} aria-busy={busy} onClick={submit}>
            <Icon name="cart" size={15} /> {busy ? "Đang tạo…" : "Tạo đơn"}
          </button>
        </div>
      }
    >
      {!canCreate && <p className="mx-5 mt-4 rounded bg-warning-soft px-3 py-2 text-[13px] text-warning">Bạn chưa có quyền tạo đơn hàng. Nhờ quản lý cấp quyền “Tạo chứng từ bán hàng”.</p>}
      <div className="grid gap-3 px-5 py-4">
        <div>
          <label className="label" htmlFor="od-search">
            Sản phẩm
          </label>
          <input id="od-search" className="input mt-1" placeholder="Tìm theo tên, mã, nhóm…" value={pq} onChange={(e) => setPq(e.target.value)} />
          <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-line-soft">
            {products === null ? (
              <li className="px-3 py-2 text-[12.5px] text-ink-2">Đang tải sản phẩm…</li>
            ) : found.length ? (
              found.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => add(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-hover">
                    <Icon name="plus" size={13} className="text-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      {p.name} {p.code && <span className="text-ink-2">· {p.code}</span>}
                    </span>
                    <span className="tnum text-ink-2">{money(p.price)}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-[12.5px] text-ink-2">{products.length ? "Không có sản phẩm khớp." : "Chưa có sản phẩm nào đang bán. Thêm ở trang Sản phẩm."}</li>
            )}
          </ul>
        </div>

        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-ink-2">
                  <th className="py-1 font-medium">Hàng</th>
                  <th className="w-16 py-1 font-medium">SL</th>
                  <th className="w-28 py-1 font-medium">Đơn giá</th>
                  <th className="w-16 py-1 font-medium">CK %</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-line-soft">
                    <td className="py-1 pr-2">
                      <span className="line-clamp-2">{l.name}</span>
                    </td>
                    <td className="py-1 pr-1">
                      <input className="input h-8 px-1.5 text-right tnum" type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Số lượng ${l.name}`} />
                    </td>
                    <td className="py-1 pr-1">
                      <input className="input h-8 px-1.5 text-right tnum" type="number" min={0} step="1000" value={l.price} onChange={(e) => setLine(i, { price: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Đơn giá ${l.name}`} />
                    </td>
                    <td className="py-1 pr-1">
                      <input className="input h-8 px-1.5 text-right tnum" type="number" min={0} max={100} value={l.discountPct} onChange={(e) => setLine(i, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} aria-label={`Chiết khấu ${l.name}`} />
                    </td>
                    <td className="py-1">
                      <button type="button" className="grid h-7 w-7 place-items-center rounded text-ink-2 hover:bg-hover hover:text-danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label={`Bỏ ${l.name}`}>
                        <Icon name="x" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12.5px] text-ink-2">
            Giảm thêm (₫)
            <input className="input mt-0.5 text-right tnum" type="number" min={0} step="1000" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <div className="text-[12.5px] text-ink-2">
            Mã giảm giá
            <div className="mt-0.5 flex gap-1">
              <input
                className="input uppercase"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setVoucher(null);
                  setVErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), checkVoucher())}
                placeholder="VD: CHAOBAN"
                aria-label="Mã giảm giá"
              />
              <button type="button" className="btn-outline flex-none px-2" disabled={!code.trim() || vBusy || !lines.length} onClick={checkVoucher}>
                {vBusy ? "…" : "Áp dụng"}
              </button>
            </div>
            {voucher && <p className="mt-0.5 text-success">{voucher.label} · −{money(voucher.discount)}</p>}
            {vErr && <p className="mt-0.5 text-danger">{vErr}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded bg-surface-2 px-3 py-2 text-[13px]">
          <dt className="text-ink-2">Tạm tính</dt>
          <dd className="text-right tnum">{money(sum.subtotal)}</dd>
          {sum.vatTotal > 0 && (
            <>
              <dt className="text-ink-2">VAT</dt>
              <dd className="text-right tnum">{money(sum.vatTotal)}</dd>
            </>
          )}
          {sum.discount > 0 && (
            <>
              <dt className="text-ink-2">Giảm</dt>
              <dd className="text-right tnum">−{money(sum.discount)}</dd>
            </>
          )}
          <dt className="font-semibold">Tổng</dt>
          <dd className="text-right font-semibold tnum">{money(sum.total)}</dd>
        </dl>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12.5px] text-ink-2">
            Tên khách
            <input className="input mt-0.5" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="text-[12.5px] text-ink-2">
            Điện thoại
            <input className="input mt-0.5 tnum" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} list="od-phones" />
            <datalist id="od-phones">
              {conv.phones.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="text-[12.5px] text-ink-2">
          Địa chỉ giao hàng
          <input className="input mt-0.5" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Số nhà, đường, phường, quận, tỉnh" />
        </label>
        <label className="text-[12.5px] text-ink-2">
          Ghi chú đơn
          <textarea className="textarea mt-0.5" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="rounded border border-line-soft p-2.5">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={sendConfirm} onChange={(e) => setSendConfirm(e.target.checked)} /> Nhắn xác nhận đơn cho khách
          </label>
          {sendConfirm && (
            <>
              <textarea className="textarea mt-2 text-[13px]" rows={5} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Mẫu tin xác nhận" />
              <p className="mt-1 text-[11.5px] text-ink-2">
                Biến: {"{ma_don} {tong_tien} {san_pham} {dia_chi} {ten} {nhan_vien} {trang}"}. {conv.kind === "comment" ? "Hội thoại bình luận: không tự gửi xác nhận (tránh trả lời công khai), hãy dùng “Nhắn riêng”." : ""}
              </p>
              <p className="mt-1 whitespace-pre-line rounded bg-surface-2 px-2 py-1.5 text-[12.5px]">{preview}</p>
            </>
          )}
        </div>
        {err && (
          <p className="rounded bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
            {err}
          </p>
        )}
      </div>
    </Drawer>
  );
}
