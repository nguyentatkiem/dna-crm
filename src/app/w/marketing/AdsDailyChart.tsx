"use client";

// Biểu đồ recharts tách riêng để tải lười (next/dynamic): trang hiện nội dung trước, recharts (~110KB gzip) tải sau.
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { vnd } from "@/lib/format";
import type { AdReport } from "@/lib/marketing/report";

export function AdsDailyChart({ daily }: { daily: AdReport["daily"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={(d: string) => `${d.slice(8)}/${d.slice(5, 7)}`} tick={{ fill: "var(--ink-2)", fontSize: 12 }} stroke="var(--line)" minTickGap={16} />
        <YAxis tickFormatter={(v: number) => vnd(v)} tick={{ fill: "var(--ink-2)", fontSize: 12 }} stroke="var(--line)" width={56} />
        <Tooltip
          formatter={(v, n) => [`${Number(v).toLocaleString("vi-VN")}đ`, n === "spend" ? "Chi phí" : "Doanh thu"]}
          labelFormatter={(d) => `Ngày ${String(d).slice(8)}/${String(d).slice(5, 7)}`}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }}
        />
        <Legend formatter={(n) => (n === "spend" ? "Chi phí" : "Doanh thu")} wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="spend" fill="#579bfc" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line dataKey="revenue" stroke="#00c875" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
