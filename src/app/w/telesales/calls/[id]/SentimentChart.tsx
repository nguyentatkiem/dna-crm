"use client";

// Biểu đồ recharts tách riêng để tải lười (next/dynamic): trang hiện nội dung trước, recharts (~110KB gzip) tải sau.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function SentimentChart({ chart }: { chart: { t: number; v: number; text: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="t" tickFormatter={(t: number) => mmss(t)} tick={{ fontSize: 11, fill: "var(--ink-2)" }} stroke="var(--line)" />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 11, fill: "var(--ink-2)" }} stroke="var(--line)" />
        <ReferenceLine y={50} stroke="var(--line)" strokeDasharray="4 4" />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, maxWidth: 260, whiteSpace: "normal" }}
          labelFormatter={(t) => mmss(Number(t))}
          formatter={(v, _n, item) => [`${v} · “${String((item.payload as { text: string }).text).slice(0, 80)}”`, "Cảm xúc"]}
        />
        <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
