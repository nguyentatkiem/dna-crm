"use client";

// Biểu đồ recharts của báo cáo — tách file để tải lười qua next/dynamic.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCell, type ReportResult } from "@/lib/reports/shared";

export const PALETTE = ["#0073ea", "#00c875", "#fdab3d", "#df2f4a", "#a25ddc", "#579bfc", "#ff642e", "#9cd326"];
const tick = { fill: "var(--ink-2)", fontSize: 11 };
const tipStyle = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--ink)", fontSize: 12 };

const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString("vi-VN")}k`;
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
};

export function ReportChart({ result, type }: { result: ReportResult; type: "bar" | "line" | "pie" }) {
  const metrics = result.columns.slice(1);
  const data = result.rows.map((r) => Object.fromEntries([["label", String(r[0])], ...metrics.map((m, i) => [m.key, Number(r[i + 1] ?? 0)])]));
  const fmt = (key: string) => (v: unknown) => fmtCell(Number(v), metrics.find((m) => m.key === key)?.kind ?? "number");

  if (type === "pie") {
    const m = metrics[0];
    return (
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart>
          <Pie data={data} dataKey={m.key} nameKey="label" innerRadius="45%" outerRadius="80%" paddingAngle={1} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--surface)" />
            ))}
          </Pie>
          <Tooltip contentStyle={tipStyle} formatter={(v) => [fmt(m.key)(v), m.label]} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  // Nhiều chỉ số khác đơn vị (vd. tiền và số đơn): chỉ vẽ các chỉ số cùng kiểu với chỉ số đầu để trục có nghĩa.
  const shown = metrics.filter((m) => m.kind === metrics[0].kind);
  const axes = (
    <>
      <CartesianGrid stroke="var(--line-soft)" vertical={false} />
      <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={10} />
      <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => (shown[0].kind === "percent" ? `${v}%` : short(Number(v)))} width={56} />
      <Tooltip contentStyle={tipStyle} formatter={(v, name) => [fmt(String(name))(v), metrics.find((m) => m.key === name)?.label ?? String(name)]} cursor={{ fill: "var(--row-hover)" }} />
      {shown.length > 1 && <Legend formatter={(v) => metrics.find((m) => m.key === v)?.label ?? v} wrapperStyle={{ fontSize: 12 }} />}
    </>
  );
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      {type === "line" ? (
        <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
          {axes}
          {shown.map((m, i) => (
            <Line key={m.key} type="monotone" dataKey={m.key} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
          {axes}
          {shown.map((m, i) => (
            <Bar key={m.key} dataKey={m.key} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
