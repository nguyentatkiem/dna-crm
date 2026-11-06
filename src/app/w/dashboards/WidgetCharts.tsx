"use client";

// Phần biểu đồ recharts của widget, tách riêng để tải lười (next/dynamic) — trang Dashboard hiện số liệu trước, biểu đồ đến sau.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtValue, type Widget, type WidgetData } from "./catalog";

const tick = { fill: "var(--ink-2)", fontSize: 11 };
const tipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", fontSize: 12 };

type Series = Extract<WidgetData, { kind: "series" }>;
type Slices = Extract<WidgetData, { kind: "slices" }>;

export function SeriesChart({ w, data, color }: { w: Widget; data: Series; color: string }) {
  const fmt = (v: number) => fmtValue(v, data.format);
  const common = { data: data.points, margin: { top: 6, right: 6, left: -12, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid stroke="var(--line-soft)" vertical={false} />
      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={14} />
      <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={fmt} width={52} allowDecimals={false} />
      <Tooltip contentStyle={tipStyle} formatter={(v) => [fmt(Number(v)), w.title]} cursor={{ fill: "var(--row-hover)" }} />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      {w.type === "line" ? (
        <LineChart {...common}>
          {axes}
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      ) : w.type === "area" ? (
        <AreaChart {...common}>
          <defs>
            <linearGradient id={`g-${w.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes}
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#g-${w.id})`} />
        </AreaChart>
      ) : (
        <BarChart {...common}>
          {axes}
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function SlicesChart({ data, donut }: { data: Slices; donut: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <PieChart>
        <Pie data={data.slices} dataKey="value" nameKey="name" innerRadius={donut ? "58%" : 0} outerRadius="92%" paddingAngle={donut ? 2 : 0} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
          {data.slices.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tipStyle} formatter={(v, n) => [fmtValue(Number(v), data.format), String(n)]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
