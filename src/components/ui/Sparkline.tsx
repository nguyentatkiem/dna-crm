"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useId } from "react";

/** Biểu đồ mini (không trục) cho ô KPI. */
export function Sparkline({ data, color = "#0073ea", height = 36 }: { data: number[]; color?: string; height?: number }) {
  const id = useId().replace(/:/g, "");
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} fill={`url(#sp-${id})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
