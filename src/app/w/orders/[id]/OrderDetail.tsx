"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order, Payment } from "@prisma/client";
import { Icon } from "@/components/Icon";
import { LinesView, TotalsBox } from "@/components/sales/LinesView";
import { DueBadge, OrderBadge } from "@/components/sales/Status";
import type { Line } from "@/lib/sales/lines";
import { ORDER_NEXT, ORDER_STATUS, PAY_METHOD, PAY_METHODS, dmy, money, remaining, ymd, type OrderStatus, type PayMethod, type Ser } from "@/lib/sales/shared";

type O = Ser<Order & { payments: Payment[] }>;
type Rec = { id: string; title: string; objectKey: string } | null;

const NEXT_LABEL: Record<OrderStatus, string> = { new: "Mở lại", confirmed: "Xác nhận", shipping: "Đang giao", done: "Hoàn tất", cancelled: "Huỷ đơn" };

export function OrderDetail({ initial, items, deal, contact, quote, dealLabel, perm }: { initial: O; items: Line[]; deal: Rec; contact: Rec; quote: { id: string; number: string } | null; dealLabel: string; perm: { seeAll: boolean; canDelete: boolean } }) {
  const router = useRouter();
  const [o, setO] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const left = remaining(o);
  const [pay, setPay] = useState({ amount: String(left || ""), method: "transfer" as PayMethod, paidAt: ymd(new Date()), note: "" });
  const [due, setDue] = useState(ymd(o.dueAt));
  const [confirmDel, setConfirmDel] = useState(false);

  async function call(url: string, method: string, body?: unknown, done?: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: j.error ?? "Không thực hiện được" });
      return null;
    }
    if (j.id) {
      setO(j);
      setPay((p) => ({ ...p, amount: String(remaining(j) || "") }));
    }
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
    return j;
  }

  const setStatus = (s: OrderStatus) => call(`/api/orders/${o.id}`, "PATCH", { status: s }, `Đã chuyển sang “${ORDER_STATUS[s].label}”${s === "done" && left > 0 ? `. Đơn còn nợ ${money(left)}.` : ""}`);
  const addPay = () => call(`/api/orders/${o.id}/payments`, "POST", { ...pay, amount: Number(pay.amount.replace(/\D/g, "")) || 0 }, "Đã ghi nhận phiếu thu");
  const delPay = (pid: string) => call(`/api/orders/${o.id}/payments?payment=${pid}`, "DELETE", undefined, "Đã xoá phiếu thu");
  const saveDue = () => call(`/api/orders/${o.id}`, "PATCH", { dueAt: due || null }, "Đã lưu hạn thanh toán");
  async function remove() {
    const j = await call(`/api/orders/${o.id}`, "DELETE");
    if (j) router.push("/w/orders");
  }

  const next = ORDER_NEXT[o.status as OrderStatus] ?? [];

  return (
    <div className="mt-1 grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold">
            <span className="tnum">{o.number}</span>
            <OrderBadge status={o.status} />
          </h1>
          <p className="mt-1 text-ink-2">
            {o.customerName} · tạo bởi {o.createdBy || "–"} ngày <span suppressHydrationWarning>{dmy(o.createdAt)}</span>
            {quote && (
              <>
                {" "}
                · từ báo giá{" "}
                <Link href={`/w/quotes/${quote.id}`} className="text-primary hover:underline">
                  {quote.number}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.status === "new" && (
            <Link href={`/w/orders/${o.id}?edit=1`} className="btn-outline">
              <Icon name="edit" size={15} /> Sửa
            </Link>
          )}
          {perm.canDelete &&
            (confirmDel ? (
              <span className="flex items-center gap-1 text-[13px]">
                Xoá đơn và {o.payments.length} phiếu thu?
                <button type="button" className="btn h-8 bg-[#df2f4a] text-white" disabled={busy} onClick={remove}>
                  Xoá
                </button>
                <button type="button" className="btn-ghost h-8" onClick={() => setConfirmDel(false)}>
                  Huỷ
                </button>
              </span>
            ) : (
              <button type="button" className="btn-ghost text-[#df2f4a]" onClick={() => setConfirmDel(true)}>
                <Icon name="trash" size={15} /> Xoá
              </button>
            ))}
        </div>
      </div>

      {next.length > 0 && (
        <section className="card flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px] text-ink-2">Chuyển trạng thái:</span>
          {next.map((s) => (
            <button key={s} type="button" disabled={busy} className={s === "cancelled" ? "btn-ghost text-[#df2f4a]" : s === next[0] ? "btn-primary" : "btn-outline"} onClick={() => setStatus(s)}>
              {NEXT_LABEL[s]}
            </button>
          ))}
        </section>
      )}
      {msg && (
        <p role="status" className={`rounded-md px-3 py-2 text-[13.5px] ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 content-start gap-4">
          <section className="card grid min-w-0 gap-4 p-4">
            <LinesView lines={items} />
            <TotalsBox t={o} paid={o.paid} />
            {o.note && <p className="whitespace-pre-line text-[14px] text-ink-2">{o.note}</p>}
          </section>

          <section className="card grid gap-3 p-4">
            <h2 className="section-title">Phiếu thu ({o.payments.length})</h2>
            {o.payments.length === 0 ? (
              <p className="text-[13.5px] text-ink-2">Chưa thu đồng nào.</p>
            ) : (
              <ul className="grid divide-y divide-line-soft">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[14px]">
                    <span className="font-semibold tnum">{money(p.amount)}</span>
                    <span className="badge">{PAY_METHOD[p.method as PayMethod] ?? p.method}</span>
                    <span className="text-[13px] text-ink-2" suppressHydrationWarning>
                      {dmy(p.paidAt)} · {p.createdBy}
                    </span>
                    {p.note && <span className="min-w-0 basis-full truncate text-[13px] text-ink-2 sm:basis-auto">{p.note}</span>}
                    {perm.canDelete && (
                      <button type="button" className="btn-ghost ml-auto h-7 w-7 justify-center p-0 text-ink-2" aria-label="Xoá phiếu thu" disabled={busy} onClick={() => delPay(p.id)}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-4">
          {o.status !== "cancelled" && left > 0 && (
            <section className="card grid gap-3 p-4">
              <h2 className="section-title">Thu tiền</h2>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 grid gap-1">
                  <span className="label">Số tiền (₫)</span>
                  <input className="input tnum" inputMode="numeric" value={pay.amount ? Number(pay.amount.replace(/\D/g, "")).toLocaleString("vi-VN") : ""} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/\D/g, "") })} />
                </label>
                <label className="grid gap-1">
                  <span className="label">Hình thức</span>
                  <select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PayMethod })}>
                    {PAY_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAY_METHOD[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="label">Ngày thu</span>
                  <input className="input" type="date" value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
                </label>
                <label className="col-span-2 grid gap-1">
                  <span className="label">Ghi chú</span>
                  <input className="input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} maxLength={500} placeholder="Đặt cọc, thanh toán đợt 2…" />
                </label>
              </div>
              <button type="button" className="btn-primary justify-center" disabled={busy || !Number(pay.amount)} onClick={addPay}>
                <Icon name="wallet" size={15} /> Ghi nhận thu {pay.amount ? money(Number(pay.amount)) : ""}
              </button>
            </section>
          )}

          <section className="card grid gap-3 p-4 text-[14px]">
            <div>
              <p className="label">Khách</p>
              <p className="mt-0.5 font-medium">{o.customerName}</p>
              <p className="text-[13px] text-ink-2 tnum">{o.customerPhone}</p>
              {contact && (
                <Link href={`/w/b/${contact.objectKey}?open=${contact.id}`} className="mt-1 inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                  <Icon name="person" size={13} /> Mở hồ sơ khách
                </Link>
              )}
            </div>
            {deal && (
              <div>
                <p className="label">{dealLabel}</p>
                <Link href={`/w/b/${deal.objectKey}?open=${deal.id}`} className="mt-0.5 inline-block font-medium text-primary hover:underline">
                  {deal.title}
                </Link>
              </div>
            )}
            <div>
              <p className="label">Hạn thanh toán</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input type="date" className="input h-8 w-auto flex-1" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Hạn thanh toán" />
                {due !== ymd(o.dueAt) && (
                  <button type="button" className="btn-outline h-8" disabled={busy} onClick={saveDue}>
                    Lưu
                  </button>
                )}
              </div>
              {left > 0 && o.dueAt && (
                <span className="mt-1 inline-flex" suppressHydrationWarning>
                  <DueBadge at={o.dueAt} />
                </span>
              )}
            </div>
            {o.status === "done" && left === 0 && <p className="badge-success w-fit">Đã hoàn tất và thu đủ</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
