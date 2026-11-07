"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui";
import { DueBadge, QuoteBadge } from "@/components/sales/Status";
import { QUOTE_STATUS, QUOTE_STATUSES, dmy, fold, money, quoteStatusOf, type QuoteStatus } from "@/lib/sales/shared";

type Row = { id: string; number: string; customerName: string; customerPhone: string; title: string; status: string; total: number; validUntil: string | null; createdBy: string; createdAt: string; viewedAt: string | null; orderId: string | null };

export function QuotesList({ initial, initialStatus, seeAll, canCreate = true }: { initial: Row[]; initialStatus: string; seeAll: boolean; canCreate?: boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of initial) c[quoteStatusOf(r)] = (c[quoteStatusOf(r)] ?? 0) + 1;
    return c;
  }, [initial]);
  const shown = useMemo(() => {
    const f = fold(q.trim());
    return initial.filter((r) => (!status || quoteStatusOf(r) === status) && (!f || fold(`${r.number} ${r.customerName} ${r.customerPhone} ${r.title}`).includes(f)));
  }, [initial, q, status]);
  const sum = shown.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <div data-tour="sales-quotes" className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold">Báo giá</h1>
          <p className="mt-1 text-ink-2">{seeAll ? "Lập, duyệt và gửi báo giá cho khách." : "Báo giá của bạn. Gửi duyệt trước khi gửi khách."}</p>
        </div>
        {canCreate && (
          <Link href="/w/quotes/new" className="btn-primary">
            <Icon name="plus" size={16} /> Tạo báo giá
          </Link>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="relative w-60 max-sm:w-full">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm số, khách, SĐT" aria-label="Tìm báo giá" className="input h-8 pl-8" />
        </label>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Lọc theo trạng thái">
        <button type="button" className={`chip flex-none ${!status ? "chip-on" : ""}`} onClick={() => setStatus("")}>
          Tất cả <span className="ml-1 text-ink-2 tnum">{initial.length}</span>
        </button>
        {QUOTE_STATUSES.filter((s) => counts[s]).map((s) => (
          <button key={s} type="button" className={`chip flex-none ${status === s ? "chip-on" : ""}`} onClick={() => setStatus(status === s ? "" : s)}>
            {QUOTE_STATUS[s as QuoteStatus].label} <span className="ml-1 text-ink-2 tnum">{counts[s]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card mt-4">
          <EmptyState icon="receipt" title={initial.length ? "Không có báo giá nào khớp" : "Chưa có báo giá"} desc="Báo giá gửi khách bằng một đường link, khách bấm Chấp nhận là có đơn hàng ngay." action={initial.length ? undefined : { label: "Tạo báo giá", href: "/w/quotes/new" }} />
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[13px] text-ink-2">
                <th className="px-3 py-2.5 font-normal">Số</th>
                <th className="px-2 py-2.5 font-normal">Khách</th>
                <th className="px-2 py-2.5 font-normal">Trạng thái</th>
                <th className="px-2 py-2.5 font-normal">Hiệu lực</th>
                <th className="px-2 py-2.5 font-normal">Người lập</th>
                <th className="px-3 py-2.5 text-right font-normal">Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-[var(--row-hover)]">
                  <td className="px-3 py-2.5">
                    <Link href={`/w/quotes/${r.id}`} className="font-medium tnum hover:underline">
                      {r.number}
                    </Link>
                    <p className="text-[12px] text-ink-2" suppressHydrationWarning>
                      {dmy(r.createdAt)}
                    </p>
                  </td>
                  <td className="max-w-[240px] px-2 py-2.5">
                    <p className="truncate">{r.customerName}</p>
                    {r.title && <p className="truncate text-[12.5px] text-ink-2">{r.title}</p>}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex flex-wrap items-center gap-1">
                      <QuoteBadge q={r} />
                      {r.viewedAt && r.status === "sent" && (
                        <span className="badge" title="Khách đã mở link">
                          <Icon name="eye" size={11} /> Đã xem
                        </span>
                      )}
                      {r.orderId && <span className="badge">Có đơn</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-[13px]" suppressHydrationWarning>
                    {r.validUntil ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-ink-2 tnum">{dmy(r.validUntil)}</span>
                        <DueBadge at={r.validUntil} done={!["draft", "pending", "approved", "sent"].includes(r.status)} />
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-[13px] text-ink-2">{r.createdBy}</td>
                  <td className="px-3 py-2.5 text-right font-medium tnum">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[13.5px]">
                <td className="px-3 py-2.5 text-ink-2" colSpan={5}>
                  {shown.length} báo giá
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tnum">{money(sum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
