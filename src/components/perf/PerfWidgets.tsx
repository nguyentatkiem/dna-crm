"use client";

// Thành phần giao diện dùng chung cho Tổng quan & Hồ sơ hiệu suất. Chỉ import phần thuần (metrics.ts), không kéo Prisma.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/Icon";
import { fmtValue, METRIC_DEFS, RANGE_PRESETS, type Delta, type FunnelStep, type MetricKey, type RangePreset } from "@/lib/perf/metrics";

export { PersonLink, personHref } from "./PersonLink";

// recharts chỉ tải khi trang thật sự vẽ biểu đồ; khung đã giữ sẵn chiều cao.
const TrendLines = dynamic(() => import("./TrendLines").then((m) => m.TrendLines), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface-2" /> });

/** Chênh lệch điểm hiệu suất so với kỳ trước, tính bằng điểm (không phải %). */
export function ScoreDelta({ cur, prev, small }: { cur: number | null; prev: number | null; small?: boolean }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  return (
    <span className={`tnum whitespace-nowrap ${small ? "text-[11px]" : "text-[12px]"} ${d === 0 ? "text-ink-2" : d > 0 ? "text-success" : "text-danger"}`} title={`Kỳ trước ${prev} điểm`}>
      {d === 0 ? "• 0" : `${d > 0 ? "▲ +" : "▼ −"}${Math.abs(d)}`} điểm
    </span>
  );
}

/** Mũi tên so với kỳ trước: xanh = tốt hơn (theo chiều chỉ số), đỏ = kém hơn. */
export function DeltaBadge({ d, small }: { d: Delta | null; small?: boolean }) {
  if (!d) return null;
  const cls = d.better === null ? "text-ink-2" : d.better ? "text-success" : "text-danger";
  const arrow = d.abs === 0 ? "•" : d.abs > 0 ? "▲" : "▼";
  const txt = d.pct == null ? (d.abs === 0 ? "" : "mới") : `${Math.abs(d.pct).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
  return (
    <span className={`tnum whitespace-nowrap ${small ? "text-[11px]" : "text-[12px]"} ${cls}`} title="So với kỳ trước cùng độ dài">
      {arrow} {txt}
    </span>
  );
}

/** Nền màu theo bách phân vị trong nhóm: ≥ 75 xanh, ≥ 50 trung tính, ≥ 25 vàng, < 25 đỏ nhạt. */
export const pctTone = (p: number | null | undefined) => (p == null ? "" : p >= 75 ? "bg-success-soft" : p >= 50 ? "" : p >= 25 ? "bg-warning-soft" : "bg-danger-soft");

/** Chọn khoảng thời gian: 7/30/90 ngày, tháng này, quý này, tùy chọn (từ ngày – đến ngày). */
export function RangePicker({ preset, from, to, onChange, disabled }: { preset: RangePreset; from: string; to: string; onChange: (p: RangePreset, from?: string, to?: string) => void; disabled?: boolean }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Khoảng thời gian" className="segmented no-scrollbar max-w-full overflow-x-auto">
        {RANGE_PRESETS.map((o) => (
          <button key={o.key} type="button" aria-pressed={o.key === preset} disabled={disabled} onClick={() => (o.key === "custom" ? onChange("custom", f, t) : onChange(o.key))} className="whitespace-nowrap">
            {o.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onChange("custom", f, t);
          }}
        >
          <label className="sr-only" htmlFor="perf-from">
            Từ ngày
          </label>
          <input id="perf-from" type="date" className="input h-8 w-[138px] px-2 text-[13px]" value={f} onChange={(e) => setF(e.target.value)} />
          <span className="text-ink-2">–</span>
          <label className="sr-only" htmlFor="perf-to">
            Đến ngày
          </label>
          <input id="perf-to" type="date" className="input h-8 w-[138px] px-2 text-[13px]" value={t} onChange={(e) => setT(e.target.value)} />
          <button type="submit" className="btn-outline h-8" disabled={disabled || !f || !t}>
            Xem
          </button>
        </form>
      )}
    </div>
  );
}

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Bản đồ nhiệt thứ × giờ (6h–22h hiển thị mặc định, giờ ngoài khung gộp vào ô đầu/cuối nếu có). */
export function Heatmap({ grid }: { grid: number[][] }) {
  const lo = 6;
  const hi = 22;
  const view = grid.map((row) => {
    const r = row.slice(lo, hi + 1);
    r[0] += row.slice(0, lo).reduce((s, x) => s + x, 0);
    r[r.length - 1] += row.slice(hi + 1).reduce((s, x) => s + x, 0);
    return r;
  });
  const max = Math.max(1, ...view.flat());
  const total = grid.flat().reduce((s, x) => s + x, 0);
  if (!total) return <p className="py-6 text-center text-[13px] text-ink-2">Chưa có cuộc gọi, tin nhắn hay ghi chú trong kỳ này.</p>;
  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="w-full min-w-[460px] border-separate border-spacing-[2px] text-[10.5px]" aria-label="Hoạt động theo thứ và giờ">
        <thead>
          <tr>
            <th className="w-7" />
            {view[0].map((_, i) => (
              <th key={i} scope="col" className="font-normal text-ink-2">
                {(i + lo) % 2 === 0 ? `${i + lo}h` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-left font-normal text-ink-2">
                {DAYS[d]}
              </th>
              {row.map((v, h) => (
                <td key={h} title={`${DAYS[d]} ${h + lo}h: ${v} hoạt động`} className="h-5 rounded-[3px]" style={{ background: v ? `color-mix(in srgb, var(--primary) ${Math.round(15 + (v / max) * 85)}%, transparent)` : "var(--surface-2)" }}>
                  <span className="sr-only">{v}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11.5px] text-ink-2">Tổng {total.toLocaleString("vi-VN")} hoạt động (cuộc gọi, tin nhắn gửi, ghi chú) · giờ Việt Nam · ô càng đậm càng nhiều.</p>
    </div>
  );
}

const FUNNEL_COLOR = ["#579bfc", "#0086c0", "#a25ddc", "#00c875"];

/** Phễu ngang: độ dài thanh theo giá trị so với bước đầu, kèm % chuyển đổi giữa các bước. */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.key}>
          <div className="flex items-center justify-between gap-2 text-[13px]">
            <span>{s.label}</span>
            <span className="tnum">
              <b>{s.value.toLocaleString("vi-VN")}</b>
              {s.conv != null && <span className="ml-1.5 text-[12px] text-ink-2">({s.conv.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}% từ bước trước)</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${Math.max(s.value ? 3 : 0, (s.value / max) * 100)}%`, background: FUNNEL_COLOR[i] }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Biểu đồ xu hướng theo tuần: một đường cho mỗi người. */
export function TrendChart({ metric, weeks, series, height = 240 }: { metric: MetricKey; weeks: string[]; series: { who: string; values: (number | null)[] }[]; height?: number }) {
  const rows = weeks.map((w, i) => ({ w, ...Object.fromEntries(series.map((s) => [s.who, s.values[i]])) }));
  if (!series.length) return <p className="py-6 text-center text-[13px] text-ink-2">Chưa có dữ liệu.</p>;
  return (
    <div style={{ height }} className="min-w-0">
      <TrendLines metric={metric} rows={rows} series={series} />
    </div>
  );
}

/** Ô "?" giải thích cách tính một chỉ số. */
export function MetricHelp({ k }: { k: MetricKey }) {
  const d = METRIC_DEFS[k];
  return (
    <span className="cursor-help text-ink-2" title={`${d.label}: ${d.formula} ${d.higherBetter ? "(Càng cao càng tốt)" : "(Càng thấp càng tốt)"}`} aria-label={`Cách tính ${d.label}`}>
      <Icon name="eye" size={12} />
    </span>
  );
}
