"use client";

// Biểu đồ recharts tách riêng để tải lười (next/dynamic) như các trang khác.
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayRow } from "@/lib/chat/metrics";

const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const tip = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" };
const axis = { fill: "var(--ink-2)", fontSize: 12 };

const DAILY_LABEL: Record<string, string> = { inMsgs: "Tin đến", outMsgs: "Tin đi", comments: "Bình luận", newConvs: "Hội thoại mới", phones: "SĐT thu được" };

export function DailyChart({ daily }: { daily: DayRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dm} tick={axis} stroke="var(--line)" minTickGap={16} />
        <YAxis allowDecimals={false} tick={axis} stroke="var(--line)" width={36} />
        <Tooltip formatter={(v, n) => [Number(v).toLocaleString("vi-VN"), DAILY_LABEL[String(n)] ?? n]} labelFormatter={(d) => `Ngày ${dm(String(d))}`} contentStyle={tip} />
        <Legend formatter={(n) => DAILY_LABEL[String(n)] ?? n} wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="inMsgs" stackId="in" fill="#579bfc" maxBarSize={22} />
        <Bar dataKey="comments" stackId="in" fill="#a25ddc" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="outMsgs" fill="#00c875" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line dataKey="newConvs" stroke="#fdab3d" strokeWidth={2} dot={false} type="monotone" />
        <Line dataKey="phones" stroke="#e2445c" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function TagDailyChart({ rows, tags }: { rows: { day: string; counts: Record<string, number> }[]; tags: { key: string; name: string; color: string }[] }) {
  const data = rows.map((r) => ({ day: r.day, ...r.counts }));
  const name = new Map(tags.map((t) => [t.key, t.name]));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dm} tick={axis} stroke="var(--line)" minTickGap={16} />
        <YAxis allowDecimals={false} tick={axis} stroke="var(--line)" width={32} />
        <Tooltip formatter={(v, n) => [Number(v), name.get(String(n)) ?? n]} labelFormatter={(d) => `Ngày ${dm(String(d))}`} contentStyle={tip} />
        <Legend formatter={(n) => name.get(String(n)) ?? n} wrapperStyle={{ fontSize: 13 }} />
        {tags.map((t, i) => (
          <Bar key={t.key} dataKey={t.key} stackId="t" fill={t.color} radius={i === tags.length - 1 ? [3, 3, 0, 0] : undefined} maxBarSize={22} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
