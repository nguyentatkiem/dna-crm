"use client";

// Biểu đồ recharts của Hiệu suất, tải lười từ PerfWidgets.TrendChart để trang khác không kéo recharts.
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { avatarColor } from "@/lib/colors";
import { fmtValue, type MetricKey } from "@/lib/perf/metrics";

export function TrendLines({ metric, rows, series }: { metric: MetricKey; rows: Record<string, unknown>[]; series: { who: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid vertical={false} stroke="var(--line-soft)" />
        <XAxis dataKey="w" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 11.5 }} />
        <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--ink-2)", fontSize: 11 }} tickFormatter={(v: number) => fmtValue(metric, v)} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 8, fontSize: 12.5, color: "var(--ink)" }} formatter={(v, name) => [fmtValue(metric, v == null ? null : Number(v)), String(name)]} labelFormatter={(l) => `Tuần từ ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.who} type="monotone" dataKey={s.who} stroke={avatarColor(s.who)} strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
