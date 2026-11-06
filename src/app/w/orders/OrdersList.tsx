"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { DueBadge, OrderBadge } from "@/components/sales/Status";
import { ORDER_STATUS, ORDER_STATUSES, dmy, fold, money, overdue, remaining } from "@/lib/sales/shared";

type Row = { id: string; number: string; customerName: string; customerPhone: string; status: string; total: number; paid: number; dueAt: string | null; createdBy: string; createdAt: string; quoteId: string | null };
type Debt = "" | "open" | "overdue";

export function OrdersList({ initial, initialStatus, initialDebt }: { initial: Row[]; initialStatus: string; initialDebt: Debt }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [debt, setDebt] = useState<Debt>(initialDebt);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return initial.filter((o) => (!status || o.status === status) && (debt === "open" ? remaining(o) > 0 : debt === "overdue" ? overdue(o) : true) && (!f || fold(`${o.number} ${o.customerName} ${o.customerPhone}`).includes(f)));
  }, [initial, q, status, debt]);
  const live = shown.filter((o) => o.status !== "cancelled");
  const sum = { revenue: live.reduce((s, o) => s + o.total, 0), paid: live.reduce((s, o) => s + o.paid, 0), debt: live.reduce((s, o) => s + remaining(o), 0) };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Đơn hàng</h1>
          <p className="mt-1 text-ink-2">Theo dõi giao hàng, thu tiền và công nợ.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/w/orders/debts" className="btn-outline">
            <Icon name="wallet" size={16} /> Công nợ
          </Link>
          <Link href="/w/orders/new" className="btn-primary">
            <Icon name="plus" size={16} /> Tạo đơn
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-xl">
        {[
          ["Doanh thu", sum.revenue, ""],
          ["Đã thu", sum.paid, "text-success"],
          ["Còn nợ", sum.debt, sum.debt ? "text-danger" : ""],
        ].map(([l, v, c]) => (
          <div key={l as string} className="card min-w-0 p-3">
            <p className="label truncate">{l}</p>
            <p className={`mt-0.5 truncate text-[17px] font-semibold tnum ${c}`}>{money(v as number)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative w-60 max-sm:w-full">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm số đơn, khách, SĐT" aria-label="Tìm đơn hàng" className="input h-8 pl-8" />
        </label>
        <label className="btn-ghost">
          <Icon name="filter" size={16} />
          <select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="bg-transparent outline-none">
            <option value="">Mọi trạng thái</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Lọc công nợ">
          {(
            [
              ["", "Tất cả"],
              ["open", "Còn nợ"],
              ["overdue", "Quá hạn"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={debt === k} onClick={() => setDebt(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon="cart" title={initial.length ? "Không có đơn nào khớp" : "Chưa có đơn hàng"} desc="Đơn được tạo khi khách chấp nhận báo giá, hoặc tạo trực tiếp." action={initial.length ? undefined : { label: "Tạo đơn", href: "/w/orders/new" }} />
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="px-3 py-2.5 font-normal">Số</th>
                <th className="px-2 py-2.5 font-normal">Khách</th>
                <th className="px-2 py-2.5 font-normal">Trạng thái</th>
                <th className="px-2 py-2.5 text-right font-normal">Tổng</th>
                <th className="px-2 py-2.5 text-right font-normal">Đã thu</th>
                <th className="px-3 py-2.5 text-right font-normal">Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const left = remaining(o);
                return (
                  <tr key={o.id} className="border-b border-line-soft last:border-0 hover:bg-[var(--row-hover)]">
                    <td className="px-3 py-2.5">
                      <Link href={`/w/orders/${o.id}`} className="font-medium tnum hover:underline">
                        {o.number}
                      </Link>
                      <p className="text-[12px] text-ink-2" suppressHydrationWarning>
                        {dmy(o.createdAt)} · {o.createdBy}
                      </p>
                    </td>
                    <td className="max-w-[220px] px-2 py-2.5">
                      <p className="truncate">{o.customerName}</p>
                      <p className="text-[12.5px] text-ink-2 tnum">{o.customerPhone}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      <OrderBadge status={o.status} />
                    </td>
                    <td className="px-2 py-2.5 text-right tnum">{money(o.total)}</td>
                    <td className="px-2 py-2.5 text-right tnum">{money(o.paid)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-medium tnum ${left ? "text-danger" : "text-ink-2"}`}>{left ? money(left) : "–"}</span>
                      {left > 0 && o.dueAt && (
                        <span className="mt-0.5 flex justify-end" suppressHydrationWarning>
                          <DueBadge at={o.dueAt} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[13.5px] font-semibold">
                <td className="px-3 py-2.5 font-normal text-ink-2" colSpan={3}>
                  {shown.length} đơn (không tính đơn huỷ)
                </td>
                <td className="px-2 py-2.5 text-right tnum">{money(sum.revenue)}</td>
                <td className="px-2 py-2.5 text-right tnum">{money(sum.paid)}</td>
                <td className="px-3 py-2.5 text-right tnum">{money(sum.debt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
