// Tờ báo giá trình bày như chứng từ (trang in và trang công khai cho khách).
import type { Company } from "@/lib/prefs";
import type { Line } from "@/lib/sales/lines";
import { dmy } from "@/lib/sales/shared";
import { LinesView, TotalsBox } from "./LinesView";

type Q = { number: string; title: string; customerName: string; customerPhone: string; customerEmail: string; createdAt: string | Date; validUntil: string | Date | null; subtotal: number; discount: number; vatTotal: number; total: number; note: string; terms: string; createdBy: string };

export function QuoteSheet({ q, items, company, print, signatures = true }: { q: Q; items: Line[]; company: Company; print?: boolean; signatures?: boolean }) {
  return (
    <article className="quote-sheet grid gap-5 text-[14px]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="flex min-w-0 items-start gap-3">
          {company.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-14 w-14 flex-none rounded object-contain" />
          )}
          <div className="min-w-0">
            <p className="text-[17px] font-semibold">{company.name}</p>
            {company.address && <p className="text-[12.5px] text-ink-2">{company.address}</p>}
            <p className="text-[12.5px] text-ink-2">{[company.phone && `ĐT: ${company.phone}`, company.email, company.taxCode && `MST: ${company.taxCode}`].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-bold uppercase tracking-wide">Báo giá</p>
          <p className="tnum">Số: {q.number}</p>
          <p className="text-[12.5px] text-ink-2">Ngày {dmy(q.createdAt)}</p>
        </div>
      </header>

      <section className="grid gap-1 sm:grid-cols-2">
        <div>
          <p className="section-title">Kính gửi</p>
          <p className="mt-0.5 font-semibold">{q.customerName}</p>
          <p className="text-[13px] text-ink-2 tnum">{[q.customerPhone, q.customerEmail].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="sm:text-right">
          {q.title && <p className="font-medium">{q.title}</p>}
          <p className="text-[13px] text-ink-2">Hiệu lực đến: {q.validUntil ? dmy(q.validUntil) : "không giới hạn"}</p>
        </div>
      </section>

      <LinesView lines={items} print={print} />
      <TotalsBox t={q} words />

      {q.note && <p className="whitespace-pre-line text-[13.5px]">{q.note}</p>}
      {(q.terms || company.bank) && (
        <section className="grid gap-2 text-[13px]">
          {q.terms && (
            <div>
              <p className="section-title">Điều khoản</p>
              <p className="mt-0.5 whitespace-pre-line">{q.terms}</p>
            </div>
          )}
          {company.bank && (
            <div>
              <p className="section-title">Thông tin chuyển khoản</p>
              <p className="mt-0.5 whitespace-pre-line">{company.bank}</p>
            </div>
          )}
        </section>
      )}

      {signatures && (
        <section className="sign-boxes mt-4 grid grid-cols-2 gap-6 text-center text-[13px]">
          <div>
            <p className="font-semibold">Đại diện khách hàng</p>
            <p className="text-[12px] text-ink-2">(Ký, ghi rõ họ tên)</p>
            <div className="h-24" />
          </div>
          <div>
            <p className="font-semibold">Đại diện {company.name || "bên bán"}</p>
            <p className="text-[12px] text-ink-2">(Ký, ghi rõ họ tên)</p>
            <div className="h-20" />
            <p>{q.createdBy}</p>
          </div>
        </section>
      )}
      {company.footer && <footer className="border-t border-line pt-3 text-center text-[12px] text-ink-2">{company.footer}</footer>}
    </article>
  );
}
