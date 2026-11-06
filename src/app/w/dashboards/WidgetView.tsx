"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ago } from "@/lib/format";
import { PALETTE, fmtValue, type Widget, type WidgetData } from "./catalog";

// recharts (~110KB gzip) chỉ tải khi có widget biểu đồ; khung giữ nguyên chiều cao nên không nhảy bố cục.
const chartLoading = () => <div className="h-full animate-pulse rounded bg-surface-2" />;
const SeriesChart = dynamic(() => import("./WidgetCharts").then((m) => m.SeriesChart), { ssr: false, loading: chartLoading });
const SlicesChart = dynamic(() => import("./WidgetCharts").then((m) => m.SlicesChart), { ssr: false, loading: chartLoading });

const SERIES_COLOR: Record<string, string> = { new_contacts_daily: "#0073ea", revenue_weekly: "#00c875", calls_daily: "#a25ddc", ad_spend_daily: "#ff642e" };

function Empty({ text }: { text: string }) {
  return <div className="grid h-full place-items-center px-3 text-center text-[13px] text-ink-2">{text}</div>;
}

/** Vẽ phần thân widget theo dữ liệu đã tính. */
export function WidgetBody({ w, data }: { w: Widget; data: WidgetData | undefined }) {
  if (!data) return <div className="h-full animate-pulse rounded bg-surface-2" />;
  if (data.kind === "error") return <Empty text={data.message} />;

  if (data.kind === "kpi") {
    const up = (data.delta ?? 0) >= 0;
    return (
      <div className="flex h-full min-w-0 flex-col justify-center">
        <p className="tnum truncate text-[30px] font-semibold leading-tight">{fmtValue(data.value, data.format)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-2">
          {data.delta != null ? (
            <span className={`tnum inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-semibold ${up ? "bg-[#00c875]/15 text-[#00a35f]" : "bg-[#df2f4a]/15 text-[#df2f4a]"}`}>
              {up ? "▲" : "▼"} {Math.abs(data.delta)}%
            </span>
          ) : data.prev != null ? (
            <span className="text-[12px]">kỳ trước: {fmtValue(data.prev, data.format)}</span>
          ) : null}
          <span className="truncate">{data.hint}</span>
        </div>
      </div>
    );
  }

  if (data.kind === "goal") {
    const pct = Math.min(100, data.pct);
    const c = data.pct >= 100 ? "#00c875" : data.pct >= 60 ? "#0073ea" : data.pct >= 30 ? "#fdab3d" : "#df2f4a";
    return (
      <div className="flex h-full min-w-0 flex-col justify-center">
        <div className="flex items-baseline justify-between gap-2">
          <p className="tnum truncate text-[22px] font-semibold">
            {fmtValue(data.value, data.format)} <span className="text-[14px] font-normal text-ink-2">/ {fmtValue(data.target, data.format)}</span>
          </p>
          <span className="tnum text-[15px] font-semibold" style={{ color: c }}>
            {data.pct}%
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: c }} />
        </div>
        <p className="mt-1.5 text-[12px] text-ink-2">{data.target ? `Còn ${data.daysLeft} ngày` : "Chưa đặt mục tiêu: bấm Chỉnh sửa để nhập"}</p>
      </div>
    );
  }

  if (data.kind === "series") {
    if (!data.points.some((p) => p.value)) return <Empty text="Chưa có dữ liệu trong khoảng này" />;
    const color = SERIES_COLOR[w.config.series ?? ""] ?? PALETTE[0];
    const fmt = (v: number) => fmtValue(v, data.format);
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="tnum text-[12.5px] text-ink-2">
          Tổng: <b className="text-ink">{fmt(data.total)}</b>
        </p>
        <div className="min-h-0 flex-1">
          <SeriesChart w={w} data={data} color={color} />
        </div>
      </div>
    );
  }

  if (data.kind === "slices") {
    if (!data.total) return <Empty text="Chưa có dữ liệu để chia nhóm" />;
    const donut = w.type === "donut";
    return (
      <div className="flex h-full min-h-0 items-center gap-3">
        <div className="relative h-full min-h-[120px] min-w-0 flex-1">
          <SlicesChart data={data} donut={donut} />
          {donut && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="tnum text-[18px] font-semibold leading-none">{fmtValue(data.total, data.format)}</p>
                <p className="mt-0.5 text-[11px] text-ink-2">tổng</p>
              </div>
            </div>
          )}
        </div>
        <ul className="grid max-h-full min-w-0 max-w-[50%] flex-none gap-1 overflow-auto text-[12.5px]">
          {data.slices.map((s) => (
            <li key={s.name} className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
              <span className="tnum ml-auto pl-1 text-ink-2">{Math.round((s.value / data.total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.kind === "funnel") {
    const max = Math.max(1, ...data.stages.map((s) => s.count));
    if (!data.stages.some((s) => s.count)) return <Empty text="Chưa có mục nào trong phễu" />;
    return (
      <ul className="grid h-full content-center gap-1.5 overflow-auto">
        {data.stages.map((s) => (
          <li key={s.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-[12.5px]">
            <span className="truncate text-ink-2">{s.name}</span>
            <div className="flex h-6 justify-center rounded bg-surface-2">
              <div className="grid h-full place-items-center rounded text-[11.5px] font-semibold text-white" style={{ width: `${Math.max(8, (s.count / max) * 100)}%`, background: s.color }}>
                {s.count}
              </div>
            </div>
            <span className="tnum w-14 text-right text-ink-2">{fmtValue(s.amount, "money")}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (data.kind === "leaderboard") {
    if (!data.rows.length) return <Empty text="Chưa có dữ liệu nhân viên trong khoảng này" />;
    const max = Math.max(1, ...data.rows.map((r) => r.value));
    return (
      <ol className="grid content-start gap-2 overflow-auto">
        {data.rows.map((r, i) => (
          <li key={r.name} className="flex min-w-0 items-center gap-2">
            <span className={`tnum w-5 flex-none text-center text-[12px] font-semibold ${i < 3 ? "text-[#fdab3d]" : "text-ink-2"}`}>{i + 1}</span>
            <Avatar name={r.name} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-medium">{r.name}</span>
                <span className="tnum flex-none font-semibold">{fmtValue(r.value, data.format)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
              </div>
              <p className="mt-0.5 text-[11.5px] text-ink-2">{r.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (data.kind === "table") {
    if (!data.rows.length) return <Empty text="Không có mục nào khớp bộ lọc" />;
    const showAmount = data.objectKey === "deals";
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface text-left text-[11.5px] uppercase tracking-wide text-ink-2">
            <tr>
              <th className="py-1 pr-2 font-medium">Tên</th>
              <th className="py-1 pr-2 font-medium">Trạng thái</th>
              <th className="hidden py-1 pr-2 font-medium sm:table-cell">Phụ trách</th>
              <th className="py-1 text-right font-medium">{showAmount ? data.amountLabel : "Điểm"}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-line-soft hover:bg-hover">
                <td className="max-w-[10rem] truncate py-1.5 pr-2">
                  <Link href={`/w/b/${data.objectKey}?open=${r.id}`} className="hover:text-primary hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="py-1.5 pr-2">
                  <span className="inline-block max-w-[8rem] truncate rounded px-2 py-0.5 text-[11.5px] font-medium text-white" style={{ background: r.statusColor }}>
                    {r.status}
                  </span>
                </td>
                <td className="hidden py-1.5 pr-2 sm:table-cell">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={r.owner} size={20} />
                    <span className="truncate text-ink-2">{r.owner}</span>
                  </span>
                </td>
                <td className="tnum py-1.5 text-right font-medium">{showAmount ? fmtValue(r.amount, "money") : r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.kind === "tasks") {
    if (!data.items.length)
      return (
        <div className="grid h-full place-items-center text-center text-[13px] text-ink-2">
          <div>
            <Icon name="check" size={22} className="mx-auto text-[#00c875]" />
            <p className="mt-1">Không có việc quá hạn. Tuyệt vời!</p>
          </div>
        </div>
      );
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="text-[12.5px] text-ink-2">
          <b className="tnum text-[#df2f4a]">{data.total}</b> việc quá hạn
        </p>
        <ul className="mt-1 grid min-h-0 content-start gap-1 overflow-auto">
          {data.items.map((t) => (
            <li key={t.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-hover">
              <span className="h-2 w-2 flex-none rounded-full bg-[#df2f4a]" />
              <Link href="/w/my-work" className="min-w-0 flex-1 truncate">
                {t.title}
              </Link>
              {t.assignee && <Avatar name={t.assignee} size={20} />}
              <span className="tnum flex-none text-[12px] text-[#df2f4a]">{t.days} ngày</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.kind === "feed") {
    if (!data.items.length) return <Empty text="Chưa có hoạt động nào" />;
    return (
      <ul className="grid h-full content-start gap-2 overflow-auto">
        {data.items.map((a) => (
          <li key={a.id} className="flex min-w-0 gap-2 text-[13px]">
            <Avatar name={a.author} size={22} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2">
                <Link href={`/w/b/${a.objectKey}?open=${a.recordId}`} className="font-medium hover:text-primary hover:underline">
                  {a.recordTitle}
                </Link>
                <span className="text-ink-2"> · </span>
                {a.body}
              </p>
              <p className="text-[11.5px] text-ink-2">
                {a.author} · {ago(a.at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}
