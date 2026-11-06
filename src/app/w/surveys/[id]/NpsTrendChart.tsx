"use client";

// Biểu đồ recharts tách riêng để tải lười (next/dynamic): trang hiện nội dung trước, recharts (~110KB gzip) tải sau.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SurveyReport } from "@/lib/survey/service";

export function NpsTrendChart({ trend }: { trend: SurveyReport["trend"] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} stroke="var(--line-soft)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
        <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: 8, fontSize: 13, color: "var(--ink)" }} formatter={(v, _n, p) => [`${v} (${(p.payload as { count: number }).count} trả lời)`, "NPS"]} labelFormatter={(l) => `Tuần từ ${l}`} />
        <Line type="monotone" dataKey="nps" stroke="#0073ea" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
