"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { vnd } from "@/lib/format";

/** Biểu đồ cột gọn theo tiền (VND). `rows`: { label, value }. */
export function MiniBars({ rows, color = "#0073ea", height = 180, unit = "money" }: { rows: { label: string; value: number }[]; color?: string; height?: number; unit?: "money" | "count" }) {
  const fmt = (n: number) => (unit === "money" ? vnd(n) : n.toLocaleString("vi-VN"));
  return (
    <div style={{ height }} className="min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--line-soft)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--ink-2)", fontSize: 11 }} tickFormatter={fmt} />
          <Tooltip
            cursor={{ fill: "var(--row-hover)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 8, fontSize: 13, color: "var(--ink)" }}
            formatter={(v) => [fmt(Number(v)), unit === "money" ? "Giá trị" : "Số lượng"]}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
