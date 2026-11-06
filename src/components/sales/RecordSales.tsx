"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { ContractBadge, DueBadge, OrderBadge, QuoteBadge } from "./Status";
import { dmy, money, remaining } from "@/lib/sales/shared";

type Q = { id: string; number: string; title: string; status: string; total: number; validUntil: string | null; createdAt: string };
type O = { id: string; number: string; status: string; total: number; paid: number; dueAt: string | null; createdAt: string };
type C = { id: string; number: string; title: string; status: string; value: number; endAt: string | null; remindDays: number };

/**
 * Khối "Bán hàng" trong ngăn chi tiết của một khách/giao dịch: báo giá, đơn hàng, hợp đồng gắn với record
 * (theo recordId hoặc contactId), kèm nút tạo báo giá điền sẵn khách.
 */
export function RecordSales({ recordId, objectKey }: { recordId: string; objectKey: string }) {
  const [data, setData] = useState<{ quotes: Q[]; orders: O[]; contracts: C[] } | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(false);
    const get = (u: string) => fetch(`${u}?record=${encodeURIComponent(recordId)}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    Promise.all([get("/api/quotes"), get("/api/orders"), get("/api/contracts")])
      .then(([q, o, c]) => live && setData({ quotes: q.items, orders: o.items, contracts: c.items }))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [recordId]);

  if (objectKey === "appointments") return null;
  const debt = data ? data.orders.reduce((s, o) => s + remaining(o), 0) : 0;
  const empty = data && !data.quotes.length && !data.orders.length && !data.contracts.length;

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">Bán hàng</h3>
        <span className="flex gap-1">
          <Link href={`/w/quotes/new?record=${recordId}`} className="btn-ghost h-7 text-[13px]">
            <Icon name="plus" size={14} /> Báo giá
          </Link>
          <Link href={`/w/orders/new?record=${recordId}`} className="btn-ghost h-7 text-[13px]">
            <Icon name="plus" size={14} /> Đơn
          </Link>
        </span>
      </div>
      {err && <p className="text-[13px] text-ink-2">Không tải được dữ liệu bán hàng.</p>}
      {!data && !err && <div className="skeleton h-16" />}
      {empty && <p className="text-[13px] text-ink-2">Chưa có báo giá, đơn hàng hay hợp đồng.</p>}
      {data && debt > 0 && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Còn nợ <span className="font-semibold tnum">{money(debt)}</span>
        </p>
      )}

      {data && data.quotes.length > 0 && (
        <Group title="Báo giá" count={data.quotes.length} href="/w/quotes">
          {data.quotes.slice(0, 5).map((q) => (
            <Row key={q.id} href={`/w/quotes/${q.id}`} title={q.number} sub={q.title || dmy(q.createdAt)} right={money(q.total)}>
              <QuoteBadge q={q} />
            </Row>
          ))}
        </Group>
      )}
      {data && data.orders.length > 0 && (
        <Group title="Đơn hàng" count={data.orders.length} href="/w/orders">
          {data.orders.slice(0, 5).map((o) => (
            <Row key={o.id} href={`/w/orders/${o.id}`} title={o.number} sub={remaining(o) ? `Còn nợ ${money(remaining(o))}` : `Đã thu ${money(o.paid)}`} right={money(o.total)}>
              <OrderBadge status={o.status} />
              {remaining(o) > 0 && <DueBadge at={o.dueAt} />}
            </Row>
          ))}
        </Group>
      )}
      {data && data.contracts.length > 0 && (
        <Group title="Hợp đồng" count={data.contracts.length} href="/w/contracts">
          {data.contracts.slice(0, 5).map((c) => (
            <Row key={c.id} href={`/w/contracts?open=${c.id}`} title={c.title} sub={c.number} right={c.value ? money(c.value) : ""}>
              <ContractBadge status={c.status} />
              {c.status === "active" && <DueBadge at={c.endAt} warnDays={c.remindDays} />}
            </Row>
          ))}
        </Group>
      )}
    </section>
  );
}

function Group({ title, count, href, children }: { title: string; count: number; href: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center justify-between text-[12.5px] text-ink-2">
        <span>
          {title} <span className="tnum">({count})</span>
        </span>
        {count > 5 && (
          <Link href={href} className="hover:underline">
            Xem tất cả
          </Link>
        )}
      </p>
      <ul className="grid divide-y divide-line-soft rounded-md border border-line-soft">{children}</ul>
    </div>
  );
}

function Row({ href, title, sub, right, children }: { href: string; title: string; sub: string; right: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 px-3 py-2 hover:bg-hover">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{title}</span>
          <span className="block truncate text-[12px] text-ink-2">{sub}</span>
        </span>
        <span className="flex flex-none flex-col items-end gap-0.5">
          <span className="text-[13px] font-medium tnum">{right}</span>
          <span className="flex gap-1">{children}</span>
        </span>
      </Link>
    </li>
  );
}
